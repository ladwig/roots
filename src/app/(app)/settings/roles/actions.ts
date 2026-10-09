"use server"

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
  const { name, permissions } = read(formData)
  const retry = roleId ? `${PATH}?edit=${roleId}` : `${PATH}?new=role`
  if (!name) back(retry, { error: "Give the role a name." })

  const { error, count } = roleId
    ? await ctx.supabase.from("roles").update({ name, permissions }, { count: "exact" }).eq("id", roleId).eq("org_id", ctx.org.id)
    : await ctx.supabase.from("roles").insert({ org_id: ctx.org.id, name, permissions }, { count: "exact" })
  if (error?.code === "23505") back(retry, { error: "A role with this name already exists." })
  if (error || !count) back(retry, { error: error?.message ?? "You can't edit this role." })
  back(PATH, { ok: "Role saved." })
}

export async function deleteRole(roleId: string) {
  const ctx = await getContext()
  const { error, count } = await ctx.supabase.from("roles").delete({ count: "exact" }).eq("id", roleId).eq("org_id", ctx.org.id)
  if (error?.code === "23503") back(`${PATH}?edit=${roleId}`, { error: "Members still have this role. Give them another role first." })
  if (error || !count) back(`${PATH}?edit=${roleId}`, { error: error?.message ?? "You can't delete this role." })
  back(PATH, { ok: "Role deleted." })
}
