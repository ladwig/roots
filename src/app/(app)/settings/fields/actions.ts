"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { refreshPublic } from "@/lib/public-cache"
import * as setup from "@/settings/server"
import { back } from "@/lib/url"

const PATH = "/settings/fields"

function readField(fd: FormData) {
  // Options: one per line or comma-separated.
  return { label: String(fd.get("label") ?? ""), options: String(fd.get("options") ?? "").split(/[\n,]/), required: fd.get("required") === "1" }
}

export async function createField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const entity = String(fd.get("entity"))
  const r = await setup.createField(ctx.supabase, ctx.org.id, { ...readField(fd), entity, type: String(fd.get("type")) })
  if ("error" in r) back(`${PATH}?new=${entity}`, { error: r.db ? dbError(t, r.db) : t.dynamic(r.error) })
  refreshPublic(ctx.org.id) // public forms show the custom fields
  back(PATH, { ok: t("fields.created") })
}

// Key and type stay fixed (stored values depend on them); label, options and required can change.
export async function updateField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const r = await setup.updateField(ctx.supabase, ctx.org.id, id, readField(fd))
  if ("error" in r) back(r.error === "errors.not_allowed" ? PATH : `${PATH}?edit=${id}`, { error: r.db ? dbError(t, r.db) : t.dynamic(r.error) })
  refreshPublic(ctx.org.id)
  back(PATH, { ok: t("fields.saved") })
}

// ponytail: stored values stay in the records' custom jsonb (invisible without the definition); re-adding the field brings them back.
export async function deleteField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const { error, count } = await ctx.supabase.from("custom_fields").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(`${PATH}?edit=${id}`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  refreshPublic(ctx.org.id)
  back(PATH, { ok: t("fields.deleted") })
}
