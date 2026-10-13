"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { sendOrgEmail } from "@/lib/org-email"
import { back } from "@/lib/url"
import { cleanHtml, readFields } from "@/letters/model"
import { contactVars, letterFileName, letterFromForm, letterPdf, loadTemplate, storeLetter, textHtml } from "@/letters/server"
import { fill } from "@/email/render"

const PATH = "/files/templates"
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim()

export async function createTemplate(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const name = text(fd, "name").slice(0, 120)
  if (!ctx.can("org.files.manage")) back(PATH, { error: t("errors.not_allowed") })
  if (!name) back(`${PATH}?new=template`, { error: t("letters.nameRequired") })
  const { data, error } = await ctx.supabase.from("letter_templates").insert({ org_id: ctx.org.id, name, title: name }).select("id").single()
  if (error) back(`${PATH}?new=template`, { error: dbError(t, error) })
  back(`${PATH}/${data!.id}?edit=1`, {})
}

export async function saveTemplate(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const id = text(fd, "id")
  const here = `${PATH}/${id}?edit=1`
  const name = text(fd, "name").slice(0, 120)
  if (!name) back(here, { error: t("letters.nameRequired") })
  let fields: unknown = []
  try {
    fields = JSON.parse(text(fd, "fields") || "[]")
  } catch {}
  const { error } = await ctx.supabase
    .from("letter_templates")
    .update({ name, title: text(fd, "title").slice(0, 200), body: cleanHtml(String(fd.get("body") ?? "")).slice(0, 100000), fields: readFields(fields), letterhead: fd.get("letterhead") === "on" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("letters.saved") })
}

/** A default (or own) template as a new own one, to adapt. */
export async function copyTemplate(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const src = await loadTemplate(ctx, text(fd, "id"))
  if (!src || !ctx.can("org.files.manage")) back(PATH, { error: t("errors.not_allowed") })
  const { data, error } = await ctx.supabase
    .from("letter_templates")
    .insert({
      org_id: ctx.org.id,
      name: src!.org_id ? `${src!.name} ${t("letters.copySuffix")}`.slice(0, 120) : src!.name,
      title: src!.title,
      body: src!.body,
      fields: readFields(src!.fields),
      letterhead: src!.letterhead,
    })
    .select("id")
    .single()
  if (error) back(`${PATH}/${src!.id}`, { error: dbError(t, error) })
  back(`${PATH}/${data!.id}?edit=1`, { ok: t("letters.copied") })
}

export async function trashTemplate(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.letter_templates", p_id: text(fd, "id") })
  if (error) back(`${PATH}/${text(fd, "id")}?edit=1`, { error: dbError(t, error) })
  back(PATH, { ok: t("letters.trashed") })
}

export async function restoreTemplate(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.letter_templates", p_id: text(fd, "id") })
  back(`${PATH}?trash=1`, error ? { error: dbError(t, error) } : { ok: t("letters.restored") })
}

/** Placeholder values + address of a contact, for the live preview. */
export async function letterContact(contactId: string) {
  const ctx = await getContext()
  if (!ctx.can("org.files.view") || !ctx.can("crm.view")) return null
  return contactVars(ctx, await getT(), String(contactId))
}

async function pdfFromForm(fd: FormData) {
  const ctx = await getContext()
  const t = await getT()
  const letter = await letterFromForm(ctx, t, fd)
  if (!letter) return { ctx, t, letter: null, bytes: null }
  return { ctx, t, letter, bytes: await letterPdf(letter) }
}

/** The letter as a PDF in Dateien: attached to the contact, else in the "Briefe" folder. Called from the composer. */
export async function saveLetter(fd: FormData): Promise<{ ok?: string; error?: string; fileId?: string }> {
  const { ctx, t, letter, bytes } = await pdfFromForm(fd)
  if (!letter || !bytes) return { error: t("errors.not_allowed") }
  if (!ctx.can("org.files.manage")) return { error: t("errors.not_allowed") }
  const stored = await storeLetter(ctx, letter, bytes, t("letters.folder"))
  return stored.error ? { error: "code" in stored.error ? dbError(t, stored.error) : stored.error.message } : { ok: t("letters.savedFile"), fileId: stored.id }
}

/** The letter as a PDF attachment to the contact's email address (org's email provider or roots' fallback). */
export async function sendLetter(fd: FormData): Promise<{ ok?: string; error?: string }> {
  const { ctx, t, letter, bytes } = await pdfFromForm(fd)
  if (!letter || !bytes) return { error: t("errors.not_allowed") }
  if (!ctx.can("org.files.manage")) return { error: t("errors.not_allowed") }
  if (!letter.contactId) return { error: t("letters.needContact") }
  if (!letter.email) return { error: t("letters.noEmail") }
  const message = fill(t("letters.mailText"), { name: letter.vars.name || "", document: letter.title, org: ctx.org.name })
  try {
    const sent = await sendOrgEmail(ctx.org.id, {
      to: letter.email,
      subject: letter.title,
      text: message,
      html: textHtml(message),
      attachments: [{ filename: letterFileName(letter.title, letter.vars.name ?? ""), content: bytes }],
    })
    return sent ? { ok: t("letters.sent") } : { error: t("email.noProvider") }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
