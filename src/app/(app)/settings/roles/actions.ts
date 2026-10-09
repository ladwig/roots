"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/settings/roles"

function read(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim()
  const permissions = formData.getAll("permissions").map(String).filter((p) => /^(\*|[a-z_]+\.(\*|[a-z_.]+))$/.test(p))
  return { name, permissions: [...new Set(permissions)] }
}

export async function saveRole(roleId: string | null, formData: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const { name, permissions } = read(formData)
  const retry = roleId ? `${PATH}?edit=${roleId}` : `${PATH}?new=role`
  if (!name) back(retry, { error: t("roles.nameRequired") })

  const { error, count } = roleId
    ? await ctx.supabase.from("roles").update({ name, permissions }, { count: "exact" }).eq("id", roleId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("roles").insert({ org_id: ctx.org.id, name, permissions }, { count: "exact" })
  if (error?.code === "23505") back(retry, { error: t("roles.nameTaken") })
  if (error || !count) back(retry, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("roles.saved") })
}

export async function deleteRole(roleId: string) {
  const ctx = await getContext()
  const t = await getT()
  const { error, count } = await ctx.supabase.from("roles").delete({ count: "exact" }).eq("id", roleId).eq("org_id", ctx.org.id)
  if (error?.code === "23503") back(`${PATH}?edit=${roleId}`, { error: t("roles.inUse") })
  if (error || !count) back(`${PATH}?edit=${roleId}`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("roles.deleted") })
}
