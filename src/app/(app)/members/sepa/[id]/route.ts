import { NextResponse } from "next/server"
import { contactName } from "@/app/(app)/contacts/fields"
import { requirePerm } from "@/lib/context"
import { pain008 } from "@/members/sepa"

// The run's direct debits as pain.008 XML, for upload to the org's online banking.
export async function GET(_req: Request, { params }: RouteContext<"/members/sepa/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("members.view")
  const [{ data: run }, { data: settings }, { data: dues }] = await Promise.all([
    ctx.supabase.from("sepa_runs").select("message_id, collection_on, created_at").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("member_settings").select("creditor_name, creditor_id, iban, bic").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase
      .from("member_dues")
      .select("id, description, amount_cents, memberships(number, account_holder, iban, bic, mandate_ref, mandate_signed_on, contacts(first_name, last_name, company, email))")
      .eq("run_id", id)
      .eq("org_id", ctx.org.id),
  ])
  if (!run || !settings?.creditor_id || !settings.iban) return new NextResponse("Not found", { status: 404 })
  const xml = pain008({
    messageId: run.message_id,
    createdAt: new Date(run.created_at),
    collectionOn: run.collection_on,
    creditor: { name: settings.creditor_name ?? ctx.org.name, iban: settings.iban, bic: settings.bic, creditorId: settings.creditor_id },
    debits: (dues ?? [])
      .filter((d) => d.memberships?.iban && d.memberships.mandate_ref && d.memberships.mandate_signed_on)
      .map((d) => {
        const m = d.memberships!
        return {
          id: d.id,
          name: m.account_holder || (m.contacts ? contactName(m.contacts) : ""),
          iban: m.iban!,
          bic: m.bic,
          mandateRef: m.mandate_ref!,
          mandateDate: m.mandate_signed_on!,
          amountCents: d.amount_cents,
          text: `${d.description} Nr. ${m.number ?? ""}`,
        }
      }),
  })
  return new NextResponse(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="sepa-${run.collection_on}.xml"` },
  })
}
