"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { ACTIVE_ORG_COOKIE, getContext } from "@/lib/context"
import { APP_URL, back } from "@/lib/url"

const PATH = "/settings/members"

export async function changeRole(formData: FormData) {
  const ctx = await getContext()
  const { error, count } = await ctx.supabase
    .from("org_members")
    .update({ role_id: String(formData.get("role_id")) }, { count: "exact" })
    .eq("id", String(formData.get("member_id")))
    .eq("org_id", ctx.org.id)
  if (error || !count) back(PATH, { error: error?.message ?? "You can't change roles." })
  back(PATH, { ok: "Role changed." })
}

export async function removeMember(memberId: string) {
  const ctx = await getContext()
  const { data, error } = await ctx.supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .select("user_id")
    .maybeSingle()
  if (error || !data) back(PATH, { error: error?.message ?? "You can't remove this member." })
  if (data.user_id === ctx.userId) {
    ;(await cookies()).delete(ACTIVE_ORG_COOKIE)
    redirect("/")
  }
  back(PATH, { ok: "Member removed." })
}

export type InviteState = { error?: string; link?: string; email?: string }

export async function createInvite(_: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getContext()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleId = String(formData.get("role_id") ?? "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }

  const token = randomBytes(32).toString("base64url")
  const token_hash = createHash("sha256").update(token).digest("hex")

  // One open invite per email: a new invite replaces the old link.
  await ctx.supabase.from("invites").delete().eq("org_id", ctx.org.id).eq("email", email).is("accepted_at", null)
  const { error } = await ctx.supabase.from("invites").insert({ org_id: ctx.org.id, email, role_id: roleId, token_hash })
  if (error) return { error: error.code === "42501" ? "You can't invite with this role." : error.message }

  revalidatePath(PATH)
  // ponytail: link is shown to copy; send it by email once a platform mail provider is set up.
  return { link: `${APP_URL}/invite/${token}`, email }
}

export async function revokeInvite(inviteId: string) {
  const ctx = await getContext()
  const { error } = await ctx.supabase.from("invites").delete().eq("id", inviteId).eq("org_id", ctx.org.id)
  if (error) back(PATH, { error: error.message })
  back(PATH, { ok: "Invite revoked." })
}
