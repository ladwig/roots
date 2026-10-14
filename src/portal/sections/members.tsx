import { cancelMyMembership, updateMyBank, updateMyData } from "@/app/s/[site]/portal/actions"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TypedInput } from "@/components/typed-input"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { earliestEnd, type Interval } from "@/members/dues"
import { IdCard } from "@/members/id-card"
import type { SectionProps } from "../sections"

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

export async function MembersSection({ orgId, orgName, site, contact, tab }: SectionProps) {
  const t = await getT()
  const db = createAdminClient()
  const [{ data: m }, { data: creditor }, { data: card }] = await Promise.all([
    db
      .from("memberships")
      .select("id, member_no, starts_on, ends_on, iban, account_holder, fee_cents, fee_interval, payment_method, fee_free_until, types:membership_types(name, fee_cents, interval, notice_months)")
      .eq("org_id", orgId)
      .eq("contact_id", contact.id)
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("member_settings").select("creditor_name, creditor_id").eq("org_id", orgId).maybeSingle(),
    db.from("contacts").select("member_code").eq("id", contact.id).eq("org_id", orgId).maybeSingle(),
  ])
  if (!m) return null
  const { data: dues } = await db.from("member_dues").select("id, description, amount_cents, due_on, status").eq("org_id", orgId).eq("membership_id", m.id).neq("status", "cancelled").order("due_on", { ascending: false }).limit(20)
  const now = today()
  const fee = m.fee_cents ?? m.types?.fee_cents ?? 0 // own fee, else the type's
  const interval = m.fee_interval ?? m.types?.interval ?? "none"
  const ended = !!m.ends_on && m.ends_on < now
  const hidden = (
    <>
      <input type="hidden" name="site" value={site} />
      <input type="hidden" name="tab" value={tab} />
    </>
  )

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ")
  const status = (
    <Badge variant={ended ? "outline" : "default"}>
      {ended ? t("membership.state.ended") : m.ends_on ? t("membership.state.ending", { date: t.date(m.ends_on) }) : t("membership.state.active")}
    </Badge>
  )
  const box = "grid gap-4 rounded-xl border bg-card p-5"

  // Card: only the card (to show at the door), centred; nothing else open on the screen.
  if (tab === "card")
    return card?.member_code && !ended ? (
      <section className="grid justify-items-center gap-4 pt-2 text-center" aria-label={t("membership.card")}>
        {status}
        <IdCard t={t} org={orgName} name={name} number={m.member_no} type={m.types?.name ?? null} code={card.member_code} large />
      </section>
    ) : (
      <p className="py-8 text-center text-muted-foreground">{ended ? t("membership.state.ended") : t("portal.noCard")}</p>
    )

  if (tab === "membership")
    return (
      <section className="grid gap-6">
        <div className={box}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t("portal.membership")}</h2>
            {status}
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t("membership.type")}</dt>
            <dd>
              {m.types?.name}
              {fee > 0 && interval !== "none" && ` · ${t("forms.feePer", { fee: t.money(fee), interval: t.dynamic(`membership.intervals.${interval}`) })}`}
              {m.fee_free_until && m.fee_free_until >= now && ` · ${t("membership.feeFreeUntilShort", { date: t.date(m.fee_free_until) })}`}
            </dd>
            <dt className="text-muted-foreground">{t("portal.number")}</dt>
            <dd>{m.member_no}</dd>
            <dt className="text-muted-foreground">{t("membership.since")}</dt>
            <dd>{t.date(m.starts_on)}</dd>
            <dt className="text-muted-foreground">{t("portal.payment")}</dt>
            <dd>{m.payment_method && m.payment_method !== "sepa" ? t.dynamic(`membership.paymentMethods.${m.payment_method}`) : m.iban ? t("portal.debitFrom", { iban: `${m.iban.slice(0, 4)} •••• ${m.iban.slice(-4)}` }) : t("portal.noDebit")}</dd>
          </dl>
        </div>
        {!ended && !m.ends_on && m.types && (
          <form action={cancelMyMembership} className={box}>
            {hidden}
            <h2 className="font-medium">{t("membership.cancel")}</h2>
            <p className="text-sm text-muted-foreground">{t("portal.cancelHint", { date: t.date(earliestEnd(now, m.types.notice_months, m.types.interval as Interval)) })}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" required className="size-4 accent-primary" /> {t("portal.cancelConfirm")}
            </label>
            <SubmitButton variant="destructive" className="justify-self-start">
              {t("membership.cancel")}
            </SubmitButton>
          </form>
        )}
      </section>
    )

  if (tab === "dues")
    return (
      <section className={box}>
        <h2 className="font-heading text-lg font-semibold">{t("portal.dues")}</h2>
        {dues?.length ? (
          <ul className="grid gap-1">
            {dues.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">{d.description}</span>
                <span className="text-muted-foreground">{t.date(d.due_on)}</span>
                <span className="font-medium tabular-nums">{t.money(d.amount_cents)}</span>
                <Badge variant={d.status === "paid" ? "default" : d.due_on < now ? "destructive" : "secondary"}>
                  {d.status === "open" && d.due_on < now ? t("membership.overdue") : t.dynamic(`membership.dueStatus.${d.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("membership.noDues")}</p>
        )}
      </section>
    )

  if (tab === "data")
    return ended ? (
      <p className="py-8 text-center text-muted-foreground">{t("membership.state.ended")}</p>
    ) : (
      <section className="grid gap-6">
        <form action={updateMyData} className={box}>
          {hidden}
          <h2 className="font-heading text-lg font-semibold">{t("portal.myData")}</h2>
          <p className="text-sm text-muted-foreground">
            {name} · {contact.email}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="p-phone">{t("contacts.phone")}</Label>
            <TypedInput kind="phone" id="p-phone" name="phone" defaultValue={contact.phone ?? ""} />
          </div>
          <Field id="p-street" name="street" label={t("contacts.street")} defaultValue={contact.street ?? ""} maxLength={200} autoComplete="street-address" />
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="p-zip">{t("contacts.postalCode")}</Label>
              <TypedInput kind="postcode" id="p-zip" name="postal_code" defaultValue={contact.postal_code ?? ""} />
            </div>
            <Field id="p-city" name="city" label={t("contacts.city")} defaultValue={contact.city ?? ""} maxLength={100} autoComplete="address-level2" />
          </div>
          <SubmitButton className="justify-self-end">{t("common.save")}</SubmitButton>
        </form>

        <form action={updateMyBank} className={box}>
          {hidden}
          <h2 className="font-heading text-lg font-semibold">{t("portal.bank")}</h2>
          <Field id="p-holder" name="account_holder" label={t("forms.accountHolder")} defaultValue={m.account_holder ?? ""} maxLength={70} />
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div className="grid content-start gap-2">
              <Label htmlFor="p-iban">IBAN</Label>
              <TypedInput kind="iban" id="p-iban" name="iban" required />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="p-bic">{t("forms.bicOptional")}</Label>
              <TypedInput kind="bic" id="p-bic" name="bic" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="mandate_ok" required className="mt-0.5 size-4 accent-primary" />
            <span>{t("forms.mandateText", { creditor: creditor?.creditor_name || orgName, id: creditor?.creditor_id ?? "–" })}</span>
          </label>
          <SubmitButton className="justify-self-end">{t("portal.saveBank")}</SubmitButton>
        </form>
      </section>
    )

  return null
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}
