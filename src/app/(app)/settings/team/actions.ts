"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { ACTIVE_ORG_COOKIE, getContext } from "@/lib/context"
import { sendPlatformEmail } from "@/lib/org-email"
import { APP_URL, back, APP_HOME } from "@/lib/url"

const PATH = "/settings/team"

export async function changeRole(formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const { error, count } = await ctx.supabase
    .from("org_members")
    .update({ role_id: String(formData.get("role_id")) }, { count: "exact" })
    .eq("id", String(formData.get("member_id")))
    .eq("org_id", ctx.org.id)
  if (error || !count) back(PATH, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("members.roleChanged") })
}

export async function removeMember(memberId: string) {
  const ctx = await getContext()
  const t = await getT()
  const { data, error } = await ctx.supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .select("user_id")
    .maybeSingle()
  if (error || !data) back(PATH, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  deliverSoon()
  if (data.user_id === ctx.userId) {
    ;(await cookies()).delete(ACTIVE_ORG_COOKIE)
    redirect(APP_HOME)
  }
  back(PATH, { ok: t("members.removed") })
}

export type InviteState = { error?: string; link?: string; email?: string; mailFailed?: boolean }

// Only the hash is stored, so a link can't be shown again, only replaced by a fresh one.
function newToken() {
  const token = randomBytes(32).toString("base64url")
  return { link: `${APP_URL}/invite/${token}`, token_hash: createHash("sha256").update(token).digest("hex") }
}

export async function createInvite(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getContext()
  const t = await getT()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleId = String(formData.get("role_id") ?? "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("members.invalidEmail") }

  const { link, token_hash } = newToken()
  // One open invite per email: a new invite replaces the old link.
  await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email).is("accepted_at", null)
  const { error } = await ctx.supabase.from("invites").insert({ org_id: ctx.org.id, email, role_id: roleId, token_hash })
  if (error) return { error: error.code === "42501" ? t("members.cantInviteRole") : dbError(t, error) }

  revalidatePath(PATH)
  deliverSoon()
  // Emailed when the platform mail is set up (best effort); the link is shown to copy either way. Without the
  // link, signing in with the invited email also works (onboarding lists open invites).
  const text = [t("invite.mailIntro", { org: ctx.org.name }), "", link, "", t("invite.mailNote")].join("\n")
  const sent = await sendPlatformEmail({ to: email, subject: t("invite.mailSubject", { org: ctx.org.name }), text, html: text.split("\n").map((l) => (l === link ? `<p><a href="${link}">${link}</a></p>` : `<p>${l.replace(/[<>&]/g, "")}</p>`)).join("") }).catch(() => false)
  return { link, email, mailFailed: !sent }
}

export async function revokeInvite(inviteId: string) {
  const ctx = await getContext()
  const t = await getT()
  const { error, count } = await ctx.supabase.from("invites").delete({ count: "exact" }).eq("id", inviteId).eq("org_id", ctx.org.id)
  if (error || !count) back(PATH, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("members.inviteRevoked") })
}

/** New link for an open invite (same row, the old link stops working, 7 more days); no mail is sent. */
export async function renewInviteLink(inviteId: string): Promise<{ link?: string; error?: string }> {
  const ctx = await getContext()
  const t = await getT()
  const { link, token_hash } = newToken()
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  // RLS: managers only, owner invites only by owners (0 rows otherwise, nothing changes).
  const { error, count } = await ctx.supabase
    .from("invites")
    .update({ token_hash, expires_at }, { count: "exact" })
    .eq("id", inviteId)
    .eq("org_id", ctx.org.id)
    .is("accepted_at", null)
  if (error || !count) return { error: error ? dbError(t, error) : t("errors.not_allowed") }
  revalidatePath(PATH) // new expiry date; the row keeps its id, so the open dialog stays
  return { link }
}
