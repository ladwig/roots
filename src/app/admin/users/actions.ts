"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePlatformAdmin } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/admin/users"

export async function updateProfile(userId: string, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const full_name = String(formData.get("full_name") ?? "").trim() || null
  const { error } = await supabase.from("profiles").update({ full_name }).eq("id", userId)
  if (error) back(`${PATH}?edit=${userId}`, { error: dbError(t, error) })
  back(`${PATH}?edit=${userId}`, { ok: t("admin.users.saved") })
}

export async function setSuperadmin(userId: string, grant: boolean) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { error, count } = grant
    ? await supabase.from("platform_admins").insert({ user_id: userId }, { count: "exact" })
    : await supabase.from("platform_admins").delete({ count: "exact" }).eq("user_id", userId)
  if (error || !count) back(`${PATH}?edit=${userId}`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(`${PATH}?edit=${userId}`, { ok: grant ? t("admin.users.granted") : t("admin.users.revoked") })
}

export async function removeMembership(userId: string, memberId: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { error } = await supabase.from("org_members").delete().eq("id", memberId).eq("user_id", userId)
  if (error) back(`${PATH}?edit=${userId}`, { error: dbError(t, error) })
  back(`${PATH}?edit=${userId}`, { ok: t("admin.orgs.memberRemoved") })
}

export async function deleteUser(userId: string, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  if (formData.get("confirm") !== "yes") back(`${PATH}?edit=${userId}`, { error: t("admin.users.deleteConfirm") })
  const { error } = await supabase.rpc("admin_delete_user", { p_user: userId })
  if (error) back(`${PATH}?edit=${userId}`, { error: dbError(t, error) })
  back(PATH, { ok: t("admin.users.deleted") })
}
