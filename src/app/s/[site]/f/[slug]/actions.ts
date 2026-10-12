"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { readSubmission } from "@/forms/elements"
import { upsertContact } from "@/forms/server"
import { getT } from "@/i18n/server"
import { sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { sitePath } from "@/lib/url"
import { getSite } from "../../data"
import type { PublicForm } from "./data"

type State = { error: string; values: Record<string, string>; attempt: number }

// Public: anyone. The form must be published (public_form), every value is validated against the form's own
// elements, then stored with the service role. Contact forms create/update the contact right away; membership
// applications wait for the board (Forms → submissions).
export async function submitForm(prev: State, fd: FormData): Promise<State> {
  const t = await getT()
  const values = Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 2000)]))
  const fail = (error: string, field?: string): State => ({ error: field ? `${field}: ${error}` : error, values, attempt: prev.attempt + 1 })
  if (String(fd.get("$website") ?? "")) return fail(t("errors.invalid_input"))
  const site = String(fd.get("$site") ?? "")
  const slug = String(fd.get("$slug") ?? "")
  const s = await getSite(site)
  const { data } = s ? await s.db.rpc("public_form", { p_org: s.org.id, p_slug: slug }) : { data: null }
  if (!s || !data) return fail(t("forms.closed"))
  const form = data as unknown as PublicForm
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const r = readSubmission(form.elements, (k) => values[k] ?? "", {
    purpose: form.purpose,
    customDefs: form.custom_fields.map((d) => ({ ...d, required: false })),
    typeIds: form.types.map((x) => x.id),
    today,
  })
  if ("error" in r) {
    const label = r.field?.startsWith("custom.") ? form.custom_fields.find((d) => `custom.${d.key}` === r.field)?.label : r.field
    return fail(t.has(r.error) ? t.dynamic(r.error) : t("errors.invalid_input"), label)
  }

  const db = createAdminClient()
  const { data: f } = await db.from("forms").select("settings").eq("id", form.id).single()
  const tags = ((f?.settings as { tags?: string[] })?.tags ?? []).slice(0, 20)
  let contactId: string | null = null
  if (form.purpose === "contact") {
    try {
      contactId = await upsertContact(db, s.org.id, r.data, tags)
    } catch (e) {
      console.error(e)
      return fail(t("errors.generic"))
    }
  }
  const { error } = await db.from("form_submissions").insert({
    org_id: s.org.id,
    form_id: form.id,
    data: r.data as never,
    email: r.data.contact.email,
    contact_id: contactId,
    status: form.purpose === "contact" ? "accepted" : "new",
  })
  if (error) {
    console.error(error)
    return fail(t("errors.generic"))
  }
  deliverSoon()
  // Confirmation to the submitter (best effort).
  if (r.data.contact.email) {
    const text = [form.success_text || t("forms.thanks"), "", `— ${s.org.name}`].join("\n")
    await sendOrgEmail(s.org.id, {
      to: r.data.contact.email,
      subject: t("forms.confirmSubject", { form: form.title }),
      text,
      html: text.split("\n").map((l) => `<p style="margin:0 0 4px">${l.replace(/[<>&]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[x]!)}</p>`).join(""),
    }).catch(() => false)
  }
  redirect(`${sitePath(site, `/f/${slug}`)}?done=1`)
}
