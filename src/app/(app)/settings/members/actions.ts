"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { ACTIVE_ORG_COOKIE, getContext } from "@/lib/context"
import { APP_URL, back } from "@/lib/url"

const PATH = "/settings/members"

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
  if (data.user_id === ctx.userId) {
    ;(await cookies()).delete(ACTIVE_ORG_COOKIE)
    redirect("/")
  }
  back(PATH, { ok: t("members.removed") })
}

export type InviteState = { error?: string; link?: string; email?: string }

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
  // ponytail: link is shown to copy; send it by email once a platform mail provider is set up.
  return { link: `${APP_URL}/invite/${token}`, email }
}

export async function revokeInvite(inviteId: string) {
  const ctx = await getContext()
  const t = await getT()
  const { error } = await ctx.supabase.from("invites").delete().eq("id", inviteId).eq("org_id", ctx.org.id)
  if (error) back(PATH, { error: dbError(t, error) })
  back(PATH, { ok: t("members.inviteRevoked") })
}
