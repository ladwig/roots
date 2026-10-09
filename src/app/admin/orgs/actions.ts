"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePlatformAdmin, setActiveOrg } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/admin/orgs"
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

async function findUserId(email: string) {
  const { supabase } = await requirePlatformAdmin()
  const { data } = await supabase.rpc("admin_users").eq("email", email.trim().toLowerCase()).maybeSingle()
  return data?.id
}

export async function createOrg(formData: FormData) {
  const { supabase, userId } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `${PATH}?new=org`
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  const ownerEmail = String(formData.get("owner") ?? "").trim()
  if (!name) back(retry, { error: t("onboarding.nameRequired") })
  if (!SLUG.test(slug)) back(retry, { error: t("onboarding.addressInvalid") })
  const owner = ownerEmail ? await findUserId(ownerEmail) : userId
  if (!owner) back(retry, { error: t("admin.orgs.ownerNotFound") })

  const { data, error } = await supabase.rpc("admin_create_org", {
    p_name: name,
    p_slug: slug,
    p_owner: owner,
  })
  if (error) back(retry, { error: error.code === "23505" ? t("onboarding.addressTaken") : dbError(t, error) })
  back(`${PATH}?edit=${data}`, { ok: t("admin.orgs.created") })
}

export async function updateOrg(orgId: string, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `${PATH}?edit=${orgId}`
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
  if (!name) back(retry, { error: t("general.nameRequired") })
  if (!SLUG.test(slug)) back(retry, { error: t("onboarding.addressInvalid") })
  const { error } = await supabase.from("orgs").update({ name, slug }).eq("id", orgId)
  if (error) back(retry, { error: error.code === "23505" ? t("onboarding.addressTaken") : dbError(t, error) })
  back(retry, { ok: t("admin.orgs.saved") })
}

export async function addMember(orgId: string, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `${PATH}?edit=${orgId}`
  const userId = await findUserId(String(formData.get("email") ?? ""))
  if (!userId) back(retry, { error: t("admin.orgs.ownerNotFound") })
  const { error } = await supabase
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role_id: String(formData.get("role_id")) })
  if (error) back(retry, { error: error.code === "23505" ? t("admin.orgs.alreadyMember") : dbError(t, error) })
  deliverSoon()
  back(retry, { ok: t("admin.orgs.added") })
}

export async function removeMember(orgId: string, memberId: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `${PATH}?edit=${orgId}`
  const { error } = await supabase.from("org_members").delete().eq("id", memberId).eq("org_id", orgId)
  if (error) back(retry, { error: dbError(t, error) })
  back(retry, { ok: t("admin.orgs.memberRemoved") })
}

export async function openOrg(orgId: string) {
  await requirePlatformAdmin()
  await setActiveOrg(orgId)
  redirect("/")
}

// To the trash (restorable for 30 days, then purged with all its data).
export async function trashOrg(orgId: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { error } = await supabase.rpc("soft_delete", { p_table: "public.orgs", p_id: orgId })
  if (error) back(`${PATH}?edit=${orgId}`, { error: dbError(t, error) })
  back(PATH, { ok: t("admin.orgs.trashed") })
}

export async function restoreOrg(orgId: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { error } = await supabase.rpc("restore_deleted", { p_table: "public.orgs", p_id: orgId })
  if (error) back(`${PATH}?trash=1&edit=${orgId}`, { error: dbError(t, error) })
  back(`${PATH}?edit=${orgId}`, { ok: t("admin.orgs.restored") })
}

// Permanently, from the trash only.
export async function deleteOrg(orgId: string, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const retry = `${PATH}?trash=1&edit=${orgId}`
  if (formData.get("confirm") !== "yes") back(retry, { error: t("admin.orgs.deleteConfirm") })
  const { error, count } = await supabase.from("orgs").delete({ count: "exact" }).eq("id", orgId).not("deleted_at", "is", null)
  if (error || !count) back(retry, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(`${PATH}?trash=1`, { ok: t("admin.orgs.deleted") })
}
