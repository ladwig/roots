// Public form submission (hosted form page + public API): validate against the form's own elements, store with the
// service role, create/update the contact for contact forms, confirm by email. Returns an error message key
// (+ field) or nothing.
import { deliverSoon } from "@/events/worker"
import type { PublicForm } from "@/app/s/[site]/f/[slug]/data"
import { readSubmission } from "@/forms/elements"
import { upsertContact } from "@/forms/server"
import type { T } from "@/i18n/translate"
import { sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"

export async function submitPublicForm(
  org: { id: string; name: string },
  form: PublicForm,
  value: (key: string) => string,
  t: T,
): Promise<{ error: string; field?: string } | { id: string }> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const r = readSubmission(form.elements, value, {
    purpose: form.purpose,
    customDefs: form.custom_fields.map((d) => ({ ...d, required: false })),
    typeIds: form.types.map((x) => x.id),
    today,
  })
  if ("error" in r) return { error: r.error, field: r.field }

  const db = createAdminClient()
  const { data: f } = await db.from("forms").select("settings").eq("id", form.id).single()
  const tags = ((f?.settings as { tags?: string[] })?.tags ?? []).slice(0, 20)
  let contactId: string | null = null
  if (form.purpose === "contact") {
    try {
      contactId = await upsertContact(db, org.id, r.data, tags)
    } catch (e) {
      console.error(e)
      return { error: "errors.generic" }
    }
  }
  const { data: row, error } = await db
    .from("form_submissions")
    .insert({
      org_id: org.id,
      form_id: form.id,
      data: r.data as never,
      email: r.data.contact.email,
      contact_id: contactId,
      status: form.purpose === "contact" ? "accepted" : "new",
    })
    .select("id")
    .single()
  if (error) {
    console.error(error)
    return { error: "errors.generic" }
  }
  deliverSoon()
  // Confirmation to the submitter (best effort).
  if (r.data.contact.email) {
    const text = [form.success_text || t("forms.thanks"), "", `— ${org.name}`].join("\n")
    await sendOrgEmail(org.id, {
      to: r.data.contact.email,
      subject: t("forms.confirmSubject", { form: form.title }),
      text,
      html: text.split("\n").map((l) => `<p style="margin:0 0 4px">${l.replace(/[<>&]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[x]!)}</p>`).join(""),
    }).catch(() => false)
  }
  return { id: row.id }
}
