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

// One open invite per email: a new invite replaces the old link. Only the hash is stored, so a link can't be shown
// again, only replaced by a fresh one.
async function issueInvite(ctx: Awaited<ReturnType<typeof getContext>>, t: Awaited<ReturnType<typeof getT>>, email: string, roleId: string) {
  const token = randomBytes(32).toString("base64url")
  const token_hash = createHash("sha256").update(token).digest("hex")
  await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email).is("accepted_at", null)
  const { data, error } = await ctx.supabase.from("invites").insert({ org_id: ctx.org.id, email, role_id: roleId, token_hash }).select("id").single()
  if (error) return { error: error.code === "42501" ? t("members.cantInviteRole") : dbError(t, error) }
  return { link: `${APP_URL}/invite/${token}`, id: data.id }
}

export async function createInvite(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getContext()
  const t = await getT()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleId = String(formData.get("role_id") ?? "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("members.invalidEmail") }

  const issued = await issueInvite(ctx, t, email, roleId)
  if ("error" in issued) return issued
  const { link } = issued

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
  const { error } = await ctx.supabase.from("invites").delete().eq("id", inviteId).eq("org_id", ctx.org.id)
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("members.inviteRevoked") })
}

/** New link for an open invite (the old one stops working); no mail is sent. */
export async function renewInviteLink(inviteId: string): Promise<{ link?: string; id?: string; error?: string }> {
  const ctx = await getContext()
  const t = await getT()
  const { data } = await ctx.supabase.from("invites").select("email, role_id").eq("id", inviteId).eq("org_id", ctx.org.id).is("accepted_at", null).maybeSingle()
  if (!data) return { error: t("errors.not_allowed") }
  // No revalidate: the new row has a new id and the list would remount (and hide) the link the user is copying.
  return issueInvite(ctx, t, data.email, data.role_id)
}
