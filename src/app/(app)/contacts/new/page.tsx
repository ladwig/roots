import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { createContact } from "../actions"
import { ContactForm } from "../contact-form"

export default async function NewContactPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("crm.manage")
  if (!ctx.modules.has("crm")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [defs, { data: tagRows }] = await Promise.all([loadFields(ctx.supabase, ctx.org.id, "contacts"), ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id })])
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
  return (
    <NewPage list={{ href: "/contacts", label: t("contacts.nav") }} title={t("contacts.new")} error={param(sp, "error")}>
      <ContactForm t={t} action={createContact} defs={defs} tags={tags} />
    </NewPage>
  )
}

export const instant = false
