import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import { EMPLOYMENT_TYPES, PAY_TYPES } from "@/hr/fields"
import type { Tables } from "@/lib/supabase/types"
import { priceInput } from "@/tickets/price"
import { saveEmployee } from "./actions"

type Employee = Tables<"employees">
type Option = { id: string; name: string }

// General data + contract. Read-only (disabled) for hr.view. Manager and shift-team pickers list the org's people.
// ponytail: plain selects; switch to a server-side picker if an org has hundreds of employees.
export function EmployeeForm({ t, e, managers, staff, disabled }: { t: T; e?: Employee | null; managers: Option[]; staff: Option[]; disabled?: boolean }) {
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <Input id={`emp-${name}`} name={name} disabled={disabled} {...props} />
    </div>
  )
  const select = (name: string, label: string, value: string, options: { value: string; label: string }[], empty?: string) => (
    <div className="grid gap-2">
      <Label htmlFor={`emp-${name}`}>{label}</Label>
      <NativeSelect id={`emp-${name}`} name={name} defaultValue={value} disabled={disabled} className="w-full">
        {empty !== undefined && <NativeSelectOption value="">{empty}</NativeSelectOption>}
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
  return (
    <form action={saveEmployee} className="grid gap-6">
      {e && <input type="hidden" name="id" value={e.id} />}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        {field("name", t("hr.name"), { required: true, maxLength: 200, defaultValue: e?.name ?? "" })}
        {field("job_title", t("hr.jobTitle"), { maxLength: 100, defaultValue: e?.job_title ?? "" })}
        {field("email", t("hr.email"), { type: "email", maxLength: 320, defaultValue: e?.email ?? "" })}
        {field("phone", t("hr.phone"), { type: "tel", maxLength: 50, defaultValue: e?.phone ?? "" })}
        {field("department", t("hr.department"), { maxLength: 100, defaultValue: e?.department ?? "" })}
        {select("manager_id", t("hr.manager"), e?.manager_id ?? "", managers.filter((m) => m.id !== e?.id).map((m) => ({ value: m.id, label: m.name })), "–")}
        {staff.length > 0 && select("staff_id", t("hr.staffLink"), e?.staff_id ?? "", staff.map((s) => ({ value: s.id, label: s.name })), t("hr.noStaffLink"))}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t("hr.contract")}</legend>
        {select("employment_type", t("hr.employmentType"), e?.employment_type ?? "part_time", EMPLOYMENT_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.types.${x}`) })))}
        {select("pay_type", t("hr.payType"), e?.pay_type ?? "hourly", PAY_TYPES.map((x) => ({ value: x, label: t.dynamic(`hr.payTypes.${x}`) })))}
        {field("starts_on", t("hr.startsOn"), { type: "date", defaultValue: e?.starts_on ?? "" })}
        {field("ends_on", t("hr.endsOn"), { type: "date", defaultValue: e?.ends_on ?? "" })}
        {field("hourly_rate", t("hr.hourlyRate"), { inputMode: "decimal", placeholder: "0,00", defaultValue: e?.hourly_rate_cents != null ? priceInput(e.hourly_rate_cents) : "" })}
        {field("monthly_salary", t("hr.monthlySalary"), { inputMode: "decimal", placeholder: "0,00", defaultValue: e?.monthly_salary_cents != null ? priceInput(e.monthly_salary_cents) : "" })}
        {field("weekly_hours", t("hr.weeklyHours"), { inputMode: "decimal", defaultValue: e?.weekly_hours ?? "" })}
        {field("vacation_days", t("hr.vacationDays"), { inputMode: "decimal", defaultValue: e?.vacation_days ?? "" })}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="emp-notes">{t("hr.notes")}</Label>
        <Textarea id="emp-notes" name="notes" rows={3} maxLength={5000} disabled={disabled} defaultValue={e?.notes ?? ""} />
      </div>
      {!disabled && <SubmitButton className="justify-self-start">{e ? t("common.save") : t("hr.create")}</SubmitButton>}
    </form>
  )
}
