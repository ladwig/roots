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

export async function createInvite(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getContext()
  const t = await getT()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleId = String(formData.get("role_id") ?? "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("members.invalidEmail") }

  const token = randomBytes(32).toString("base64url")
  const token_hash = createHash("sha256").update(token).digest("hex")

  // One open invite per email: a new invite replaces the old link.
  await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email).is("accepted_at", null)
  const { error } = await ctx.supabase.from("invites").insert({ org_id: ctx.org.id, email, role_id: roleId, token_hash })
  if (error) return { error: error.code === "42501" ? t("members.cantInviteRole") : dbError(t, error) }

  revalidatePath(PATH)
  deliverSoon()
  // Emailed when the platform mail is set up (best effort); the link is shown to copy either way. Without the
  // link, signing in with the invited email also works (onboarding lists open invites).
  const link = `${APP_URL}/invite/${token}`
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
