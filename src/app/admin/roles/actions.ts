"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePlatformAdmin } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/admin/roles"

function read(formData: FormData) {
  const name = { de: String(formData.get("name_de") ?? "").trim(), en: String(formData.get("name_en") ?? "").trim() }
  if (!name.en) name.en = name.de
  const permissions = formData.getAll("permissions").map(String).filter((p) => /^(\*|[a-z_]+\.(\*|[a-z_.]+))$/.test(p))
  return { name, permissions: [...new Set(permissions)] }
}

export async function saveRole(roleId: string | null, formData: FormData) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { name, permissions } = read(formData)
  const retry = roleId ? `${PATH}?edit=${roleId}` : `${PATH}?new=role`
  if (!name.de) back(retry, { error: t("roles.nameRequired") })

  // The owner role's permissions are implicit; only its names can change.
  const { error, count } = roleId
    ? await supabase
        .from("roles")
        .update(formData.has("owner") ? { name } : { name, permissions }, { count: "exact" })
        .eq("id", roleId)
    : await supabase.from("roles").insert({ name, permissions }, { count: "exact" })
  if (error?.code === "23505") back(retry, { error: t("roles.nameTaken") })
  if (error || !count) back(retry, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("roles.saved") })
}

export async function deleteRole(roleId: string) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const { error, count } = await supabase.from("roles").delete({ count: "exact" }).eq("id", roleId)
  if (error?.code === "23503") back(`${PATH}?edit=${roleId}`, { error: t("roles.inUse") })
  if (error || !count) back(`${PATH}?edit=${roleId}`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("roles.deleted") })
}
