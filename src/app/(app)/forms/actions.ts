"use server"

import { slugify } from "@/app/(app)/events/slug"
import { parseTags } from "@/app/(app)/contacts/fields"
import { deliverSoon } from "@/events/worker"
import { isKnownField, PURPOSES, template, type Element, type Purpose, type Submission } from "@/forms/elements"
import { membershipFromSubmission, upsertContact } from "@/forms/server"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { refreshPublic } from "@/lib/public-cache"
import { back } from "@/lib/url"

const PATH = "/forms"
const str = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max) || null

async function manager(path = PATH) {
  const ctx = await requirePerm("forms.manage")
  const t = await getT()
  if (!ctx.modules.has("forms")) back(path, { error: t("errors.not_allowed") })
  return { ctx, t }
}

async function loadForm(ctx: Awaited<ReturnType<typeof requirePerm>>, id: string) {
  const { data } = await ctx.supabase.from("forms").select("id, purpose, elements").eq("id", id).eq("org_id", ctx.org.id).single()
  return data ? { ...data, elements: data.elements as unknown as Element[], purpose: data.purpose as Purpose } : null
}
async function saveElements(id: string, elements: Element[]) {
  const { ctx, t } = await manager()
  const here = `${PATH}/${id}`
  const { error } = await ctx.supabase.from("forms").update({ elements: elements as never }).eq("id", id).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t("forms.saved") })
}

export async function createForm(fd: FormData) {
  const { ctx, t } = await manager()
  const title = str(fd, "title", 200)
  const purpose = PURPOSES.find((p) => p === fd.get("purpose")) ?? "contact"
  if (!title) back(`${PATH}?new=1`, { error: t("forms.titleRequired") })
  if (purpose === "membership" && !ctx.modules.has("members")) back(`${PATH}?new=1`, { error: t("forms.needsMembers") })
  const base = slugify(title) || "form"
  const { data: taken } = await ctx.supabase.from("forms").select("slug").eq("org_id", ctx.org.id).like("slug", `${base}%`)
  let slug = base
  for (let i = 2; taken?.some((x) => x.slug === slug); i++) slug = `${base}-${i}`
  const { data, error } = await ctx.supabase
    .from("forms")
    .insert({
      org_id: ctx.org.id,
      title,
      slug,
      purpose,
      elements: template(purpose, { privacy: t("forms.defaultPrivacy", { org: ctx.org.name }), statutes: t("forms.defaultStatutes") }) as never,
      success_text: t(purpose === "membership" ? "forms.defaultSuccessMembership" : "forms.defaultSuccess"),
    })
    .select("id")
    .single()
  if (error || !data) back(`${PATH}?new=1`, { error: dbError(t, error) })
  back(`${PATH}/${data.id}`, { ok: t("forms.created") })
}

export async function saveFormSettings(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const here = `${PATH}/${id}`
  const title = str(fd, "title", 200)
  const slug = slugify(str(fd, "slug", 80) ?? "")
  if (!title || !slug) back(here, { error: t("forms.titleRequired") })
  const status = (["draft", "published", "closed"] as const).find((s) => s === fd.get("status")) ?? "draft"
  const { error } = await ctx.supabase
    .from("forms")
    .update({
      title,
      slug,
      status,
      intro: str(fd, "intro", 5000),
      success_text: str(fd, "success_text", 2000),
      settings: { tags: parseTags(String(fd.get("tags") ?? "")).slice(0, 20) },
    })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) back(here, { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(here, { ok: t("forms.saved") })
}

export async function addElement(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const form = await loadForm(ctx, id)
  if (!form) back(PATH, { error: t("errors.not_allowed") })
  const kind = String(fd.get("kind") ?? "")
  const eid = Math.random().toString(36).slice(2, 10)
  let el: Element | null = null
  if (kind === "text") el = { id: eid, kind: "text", body: str(fd, "body", 5000) ?? "" }
  else if (kind === "consent") el = { id: eid, kind: "consent", label: str(fd, "label", 1000) ?? t("forms.consent"), required: true }
  else if (kind === "mandate" && form.purpose === "membership" && !form.elements.some((e) => e.kind === "mandate")) el = { id: eid, kind: "mandate" }
  else if (kind.startsWith("field:")) {
    const field = kind.slice(6)
    const custom = (await loadFields(ctx.supabase, ctx.org.id, "contacts")).map((d) => d.key)
    if (isKnownField(field, form.purpose, custom) && !form.elements.some((e) => e.kind === "field" && e.field === field)) el = { id: eid, kind: "field", field, required: false }
  }
  if (!el) back(`${PATH}/${id}`, { error: t("errors.invalid_input") })
  await saveElements(id, [...form.elements, el])
}

export async function updateElement(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const eid = String(fd.get("element") ?? "")
  const form = await loadForm(ctx, id)
  if (!form) back(PATH, { error: t("errors.not_allowed") })
  const elements = form.elements.map((e): Element => {
    if (e.id !== eid) return e
    if (e.kind === "field") return { ...e, label: str(fd, "label", 200) ?? undefined, help: str(fd, "help", 500) ?? undefined, required: fd.get("required") === "on" }
    if (e.kind === "consent") return { ...e, label: str(fd, "label", 1000) ?? e.label, required: fd.get("required") === "on" }
    if (e.kind === "text") return { ...e, body: str(fd, "body", 5000) ?? "" }
    return e
  })
  await saveElements(id, elements)
}

export async function moveElement(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const form = await loadForm(ctx, id)
  if (!form) back(PATH, { error: t("errors.not_allowed") })
  const i = form.elements.findIndex((e) => e.id === fd.get("element"))
  const j = i + (fd.get("dir") === "up" ? -1 : 1)
  if (i < 0 || j < 0 || j >= form.elements.length) back(`${PATH}/${id}`, {})
  const elements = [...form.elements]
  ;[elements[i], elements[j]] = [elements[j], elements[i]]
  await saveElements(id, elements)
}

export async function removeElement(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const form = await loadForm(ctx, id)
  if (!form) back(PATH, { error: t("errors.not_allowed") })
  await saveElements(id, form.elements.filter((e) => e.id !== fd.get("element")))
}

export async function trashForm(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.forms", p_id: id })
  if (error) back(`${PATH}/${id}`, { error: dbError(t, error) })
  refreshPublic(ctx.org.id) // public pages show this
  back(PATH, { ok: t("forms.trashed") })
}

export async function restoreForm(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.forms", p_id: str(fd, "id", 36) ?? "" })
  // Another live form took the slug meanwhile → unique violation.
  refreshPublic(ctx.org.id) // public pages show this
  back(`${PATH}?trash=1`, error ? { error: error.code === "23505" ? t("errors.slug_taken") : dbError(t, error) } : { ok: t("forms.restored") })
}

/** Membership application → member (contact + membership); contact form submissions are already in. */
export async function acceptSubmission(fd: FormData) {
  const { ctx, t } = await manager()
  const id = str(fd, "id", 36) ?? ""
  const back_ = String(fd.get("back") ?? "")
  const here = back_.startsWith("/forms/") ? back_ : PATH
  const { data: sub } = await ctx.supabase
    .from("form_submissions")
    .select("id, data, status, created_at, forms(purpose, settings)")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .single()
  if (!sub || sub.status !== "new") back(here, { error: t("errors.not_allowed") })
  const tags = ((sub.forms?.settings as { tags?: string[] })?.tags ?? []).slice(0, 20)
  const data = sub.data as unknown as Submission
  if (sub.forms?.purpose === "membership" && !ctx.can("members.manage")) back(here, { error: t("errors.not_allowed") })
  try {
    if (sub.forms?.purpose === "membership") {
      const r = await membershipFromSubmission(ctx.supabase, ctx.org.id, data, sub.created_at, tags, (type) => t("membership.entryFeeText", { type }))
      await ctx.supabase.from("form_submissions").update({ status: "accepted", contact_id: r.contactId, membership_id: r.membershipId }).eq("id", id)
    } else {
      const contactId = await upsertContact(ctx.supabase, ctx.org.id, data, tags)
      await ctx.supabase.from("form_submissions").update({ status: "accepted", contact_id: contactId }).eq("id", id)
    }
  } catch (e) {
    back(here, { error: dbError(t, e as { message?: string; code?: string }) })
  }
  deliverSoon()
  back(here, { ok: t("forms.accepted") })
}

export async function rejectSubmission(fd: FormData) {
  const { ctx, t } = await manager()
  const back_ = String(fd.get("back") ?? "")
  const here = back_.startsWith("/forms/") ? back_ : PATH
  const { error } = await ctx.supabase.from("form_submissions").update({ status: "rejected" }).eq("id", str(fd, "id", 36) ?? "").eq("org_id", ctx.org.id).eq("status", "new")
  back(here, error ? { error: dbError(t, error) } : { ok: t("forms.rejected") })
}
