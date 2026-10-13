import { contactName } from "@/app/(app)/contacts/fields"
import { ContactPicker } from "@/components/contact-picker"
import { NewPage } from "@/components/new-page"
import { SubmitButton } from "@/components/submit-button"
import { Separator } from "@/components/ui/separator"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { saveMembership } from "../actions"
import { Field, MembershipFields, TYPE_COLS } from "../membership-parts"

// New member: an existing contact (?contact= preselects one) or a new person, then the membership.
export default async function NewMemberPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("members.manage")
  const t = await getT()
  const sp = await searchParams
  const contact = param(sp, "contact")
  const [{ data: types }, { data: preset }, defs] = await Promise.all([
    ctx.supabase.from("membership_types").select(TYPE_COLS).eq("org_id", ctx.org.id).order("name"),
    contact && /^[0-9a-f-]{36}$/.test(contact)
      ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", contact).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadFields(ctx.supabase, ctx.org.id, "memberships"),
  ])
  return (
    <NewPage list={{ href: "/members", label: t("membership.nav") }} title={t("membership.new")} error={param(sp, "error")}>
      <form action={saveMembership} className="grid gap-4">
        <fieldset className="grid gap-4">
          <legend className="mb-2 font-medium">{t("membership.person")}</legend>
          <ContactPicker name="contact_id" label={t("membership.existingContact")} initial={preset ? { id: preset.id, label: contactName(preset), detail: preset.email ?? "" } : null} />
          <p className="text-xs text-muted-foreground">{t("membership.newContactHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="m-first" name="first_name" label={t("contacts.firstName")} maxLength={100} autoComplete="off" />
            <Field id="m-last" name="last_name" label={t("contacts.lastName")} maxLength={100} autoComplete="off" />
          </div>
          <Field id="m-email" name="email" type="email" label={t("contacts.email")} maxLength={320} autoComplete="off" />
        </fieldset>
        <Separator />
        <MembershipFields t={t} types={types ?? []} defs={defs} />
        <SubmitButton className="justify-self-start">{t("membership.create")}</SubmitButton>
      </form>
    </NewPage>
  )
}

export const instant = false
