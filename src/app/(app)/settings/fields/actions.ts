"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { CUSTOM_ENTITIES, FIELD_TYPES, fieldKey, type CustomEntity } from "@/lib/custom-fields"
import { back } from "@/lib/url"

const PATH = "/settings/fields"

function readField(fd: FormData) {
  const label = String(fd.get("label") ?? "").trim().slice(0, 100)
  // Options: one per line or comma-separated, unique.
  const options = [...new Set(String(fd.get("options") ?? "").split(/[\n,]/).map((o) => o.trim().slice(0, 100)).filter(Boolean))].slice(0, 100)
  return { label, options, required: fd.get("required") === "1" }
}

export async function createField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const entity = String(fd.get("entity")) as CustomEntity
  const type = String(fd.get("type"))
  const f = readField(fd)
  const here = `${PATH}?new=${entity}`
  if (!(entity in CUSTOM_ENTITIES) || !FIELD_TYPES.includes(type as never) || !f.label) back(here, { error: t("errors.invalid_input") })
  if (type === "select" && !f.options.length) back(here, { error: t("errors.options_required") })
  const { count } = await ctx.supabase.from("custom_fields").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("entity", entity)
  const { error } = await ctx.supabase.from("custom_fields").insert({
    org_id: ctx.org.id,
    entity,
    type,
    key: fieldKey(f.label),
    label: f.label,
    options: type === "select" ? f.options : [],
    required: f.required,
    position: count ?? 0,
  })
  if (error) back(here, { error: error.code === "23505" ? t("errors.field_exists") : dbError(t, error) })
  back(PATH, { ok: t("fields.created") })
}

// Key and type stay fixed (stored values depend on them); label, options and required can change.
export async function updateField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const f = readField(fd)
  const here = `${PATH}?edit=${id}`
  if (!f.label) back(here, { error: t("errors.invalid_input") })
  const { data: old } = await ctx.supabase.from("custom_fields").select("type").eq("id", id).eq("org_id", ctx.org.id).maybeSingle()
  if (!old) back(PATH, { error: t("errors.not_allowed") })
  if (old.type === "select" && !f.options.length) back(here, { error: t("errors.options_required") })
  const { error } = await ctx.supabase
    .from("custom_fields")
    .update({ label: f.label, required: f.required, ...(old.type === "select" ? { options: f.options } : {}) })
    .eq("id", id)
  if (error) back(here, { error: dbError(t, error) })
  back(PATH, { ok: t("fields.saved") })
}

// ponytail: stored values stay in the records' custom jsonb (invisible without the definition); re-adding the field brings them back.
export async function deleteField(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const id = String(fd.get("id") ?? "")
  const { error, count } = await ctx.supabase.from("custom_fields").delete({ count: "exact" }).eq("id", id).eq("org_id", ctx.org.id)
  if (error || !count) back(`${PATH}?edit=${id}`, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("fields.deleted") })
}
