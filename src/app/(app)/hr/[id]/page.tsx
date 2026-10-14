import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { TAX_CLASSES } from "@/hr/fields"
import { absenceDays, vacationTaken } from "@/hr/pay"
import { payrollMonth } from "@/hr/server"
import { requirePerm } from "@/lib/context"
import { monthOf } from "@/lib/time"
import { param } from "@/lib/url"
import { restoreEmployee, savePrivate, trashEmployee } from "../actions"
import { EmployeeForm } from "../employee-form"

// One employee: general data + contract, personal data (hr.manage only), absences + holiday left, this month's
// hours and gross preview, documents.
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const ctx = await requirePerm("hr.view")
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("hr.manage")
  const year = new Date().getFullYear()
  const month = monthOf()
  const [{ data: e }, { data: priv }, { data: absences }, { data: people }, payroll] = await Promise.all([
    ctx.supabase.from("employees").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    canManage ? ctx.supabase.from("employee_private").select("*").eq("employee_id", id).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("absences").select("id, kind, starts_on, ends_on, half_day, note").eq("employee_id", id).eq("org_id", ctx.org.id).gte("ends_on", `${year}-01-01`).order("starts_on", { ascending: false }),
    ctx.supabase.from("employees").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500),
    payrollMonth(ctx.supabase, ctx.org.id, month),
  ])
  if (!e) notFound()
  const pay = payroll.find((p) => p.employee_id === id)
  const taken = vacationTaken(absences ?? [], year)
  const day = (v: string) => t.date(v, { dateStyle: "medium" })
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`p-${name}`}>{label}</Label>
      <Input id={`p-${name}`} name={name} defaultValue={(priv as Record<string, string | null> | null)?.[name] ?? ""} {...props} />
    </div>
  )

  const aside = (
          <>
            <FormCard
              id="absences"
              title={t("hr.tabs.absences")}
              action={
                canManage && (
                  <Button render={<Link href={`/hr/absences?new=absence&employee=${e.id}`} />} nativeButton={false} size="sm" variant="outline">
                    <PlusIcon /> {t("hr.addAbsence")}
                  </Button>
                )
              }
            >
              {e.vacation_days != null && (
                <p className="text-sm">{t("hr.vacationLeft", { left: t.number(Number(e.vacation_days) - taken), total: t.number(Number(e.vacation_days)), year })}</p>
              )}
              <ul className="grid gap-2">
                {(absences ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="grid">
                      <span className="font-medium">{t.dynamic(`hr.kinds.${a.kind}`)}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.starts_on === a.ends_on ? day(a.starts_on) : `${day(a.starts_on)} – ${day(a.ends_on)}`}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{t("hr.days", { count: absenceDays(a) })}</span>
                  </li>
                ))}
                {!absences?.length && <li className="text-sm text-muted-foreground">{t("hr.noAbsences")}</li>}
              </ul>
            </FormCard>
            <FormCard id="pay" title={t("hr.thisMonth")}>
              {e.staff_id && pay ? (
                <>
                  <p className="text-sm">
                    {t("hr.approvedHours", { hours: t.number(pay.approved_minutes / 60, { maximumFractionDigits: 2 }) })}
                    {pay.gross_cents != null && ` · ${t("hr.gross", { amount: t.money(pay.gross_cents) })}`}
                  </p>
                  {pay.unapproved_entries > 0 && <p className="text-xs text-muted-foreground">{t("hr.unapproved", { count: pay.unapproved_entries })}</p>}
                  {pay.warnings.map((w) => (
                    <Badge key={w} variant="destructive" className="justify-self-start">
                      {t.dynamic(`hr.payWarnings.${w}`)}
                    </Badge>
                  ))}
                  {ctx.can("shifts.view") && (
                    <Link href={`/shifts/hours/${e.staff_id}`} className="text-sm underline underline-offset-4">
                      {t("hr.toHours")}
                    </Link>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{pay?.gross_cents != null ? t("hr.gross", { amount: t.money(pay.gross_cents) }) : t("hr.noHours")}</p>
              )}
            </FormCard>
            <FileList ctx={ctx} entity="employees" entityId={e.id} back={`/hr/${e.id}#files`} />
          </>
  )

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/hr", label: t("hr.title") }, { label: e.name }]}
        title={e.name}
        badge={<Badge variant="secondary">{t.dynamic(`hr.types.${e.employment_type}`)}</Badge>}
        meta={e.job_title}
        menu={
          canManage &&
          !e.deleted_at && (
            <ActionsMenu>
              <MenuLink href={`/hr/absences?new=absence&employee=${e.id}`} icon={<PlusIcon />}>
                {t("hr.addAbsence")}
              </MenuLink>
              <MenuSeparator />
              <MenuSubmit form="trash-employee" icon={<Trash2Icon />} destructive>
                {t("hr.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {canManage && !e.deleted_at && (
        <form id="trash-employee" action={trashEmployee} hidden>
          <input type="hidden" name="id" value={e.id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {e.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("hr.inTrash")}</p>
          {canManage && (
            <form action={restoreEmployee}>
              <input type="hidden" name="id" value={e.id} />
              <SubmitButton>{t("hr.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <RecordLayout aside={aside}>
          <EmployeeForm t={t} e={e} managers={people ?? []} disabled={!canManage} />
          {canManage && (
            <form action={savePrivate} className="grid gap-6">
              <input type="hidden" name="employee_id" value={e.id} />
              <FormCard id="private" title={t("hr.private")} description={t("hr.privateHint")}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <Label htmlFor="p-birthday">{t("hr.birthday")}</Label>
                    <TypedInput kind="date" id="p-birthday" name="birthday" defaultValue={priv?.birthday ?? ""} />
                  </div>
                  {field("nationality", t("hr.nationality"), { maxLength: 60 })}
                  {field("street", t("hr.street"), { maxLength: 200, autoComplete: "off" })}
                  <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                    <div className="grid content-start gap-2">
                      <Label htmlFor="p-postal_code">{t("hr.postalCode")}</Label>
                      <TypedInput kind="postcode" id="p-postal_code" name="postal_code" country={priv?.country} defaultValue={priv?.postal_code ?? ""} autoComplete="off" />
                    </div>
                    {field("city", t("hr.city"), { maxLength: 100, autoComplete: "off" })}
                  </div>
                  {field("country", t("hr.country"), { maxLength: 2, placeholder: "DE", className: "max-w-20 uppercase" })}
                  {field("emergency_contact", t("hr.emergencyContact"), { maxLength: 300 })}
                </div>
              </FormCard>
              <FormCard id="bank" title={t("hr.bankTax")}>
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div className="grid content-start gap-2">
                    <Label htmlFor="p-iban">IBAN</Label>
                    <TypedInput kind="iban" id="p-iban" name="iban" defaultValue={priv?.iban ?? ""} />
                  </div>
                  <div className="grid content-start gap-2">
                    <Label htmlFor="p-bic">BIC</Label>
                    <TypedInput kind="bic" id="p-bic" name="bic" defaultValue={priv?.bic ?? ""} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {field("tax_id", t("hr.taxId"), { inputMode: "numeric", maxLength: 14, autoComplete: "off", className: "font-mono" })}
                    <div className="grid gap-2">
                      <Label htmlFor="p-tax_class">{t("hr.taxClass")}</Label>
                      <NativeSelect id="p-tax_class" name="tax_class" defaultValue={priv?.tax_class ?? ""} className="w-full">
                        <NativeSelectOption value="">–</NativeSelectOption>
                        {TAX_CLASSES.map((c) => (
                          <NativeSelectOption key={c} value={c}>
                            {c}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    {field("social_security_no", t("hr.socialSecurityNo"), { maxLength: 20, autoComplete: "off" })}
                    {field("health_insurance", t("hr.healthInsurance"), { maxLength: 100 })}
                </div>
              </FormCard>
              <SaveBar />
            </form>
          )}
        </RecordLayout>
      )}
    </Page>
  )

}

export const instant = false
