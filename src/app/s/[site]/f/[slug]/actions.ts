"use server"

import { redirect } from "next/navigation"
import { submitPublicForm } from "@/forms/public"
import { getT } from "@/i18n/server"
import { siteActionPath } from "@/lib/url"
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
  const r = await submitPublicForm(s.org, form, (k) => values[k] ?? "", t)
  if ("error" in r) {
    const label = r.field?.startsWith("custom.") ? form.custom_fields.find((d) => `custom.${d.key}` === r.field)?.label : r.field
    return fail(t.has(r.error) ? t.dynamic(r.error) : t("errors.invalid_input"), label)
  }
  redirect(`${siteActionPath(site, `/f/${slug}`)}?done=1`)
}
