import { contactName, CONTACT_FIELDS } from "@/app/(app)/contacts/fields"
import type { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import type { Table } from "@/lib/export"
import { MEMBER_FIELDS } from "@/members/fields"
import { monthOf } from "@/lib/time"
import { minutes } from "@/shifts/time"
import { payrollMonth } from "@/hr/server"

type Ctx = Awaited<ReturnType<typeof getContext>>
type T = Awaited<ReturnType<typeof getT>>
type Exporter = { perm: string; module: string; name: string; load: (ctx: Ctx, t: T, sp: URLSearchParams) => Promise<Table> }

const MAX = 50_000
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
const clean = (q: string | null) => q?.replace(/[%,()*]/g, "").trim() || ""
// Pages of 1000 (PostgREST's max per request) until done.
async function all<R>(page: (from: number, to: number) => PromiseLike<{ data: R[] | null }>) {
  const out: R[] = []
  for (let from = 0; from < MAX; from += 1000) {
    const { data } = await page(from, from + 999)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}
const label = (t: T, key: string) => (t.has(key) ? t.dynamic(key) : key)
const contactCols = CONTACT_FIELDS.map((f) => f.key)
const contactCells = (c: Record<string, unknown> | null) => contactCols.map((k) => (k === "tags" ? ((c?.tags as string[]) ?? []).join(", ") : ((c?.[k] as string) ?? "")))

// Column headers match the import's field labels, so an export can be edited and imported again.
export const EXPORTERS: Record<string, Exporter> = {
  contacts: {
    perm: "crm.view",
    module: "crm",
    name: "contacts",
    async load(ctx, t, sp) {
      const defs = await loadFields(ctx.supabase, ctx.org.id, "contacts")
      const q = clean(sp.get("q"))
      const tag = sp.get("tag")
      const rows = await all((from, to) => {
        let query = ctx.supabase.from("contacts").select("*").eq("org_id", ctx.org.id).is("deleted_at", null).order("last_name").order("first_name").range(from, to)
        if (q) query = query.or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.%${q}%`).join(","))
        if (tag) query = query.contains("tags", [tag])
        return query
      })
      return {
        headers: [...CONTACT_FIELDS.map((f) => label(t, f.label)), ...defs.map((d) => d.label)],
        rows: rows.map((c) => [...contactCells(c), ...defs.map((d) => (c.custom as Record<string, string | number | boolean>)?.[d.key]?.toString() ?? "")]),
      }
    },
  },
  members: {
    perm: "members.view",
    module: "members",
    name: "members",
    async load(ctx, t, sp) {
      const now = today()
      const status = sp.get("status") ?? "active"
      const type = sp.get("type")
      const q = clean(sp.get("q"))
      const rows = await all((from, to) => {
        let query = ctx.supabase
          .from("memberships")
          .select("member_no, starts_on, ends_on, account_holder, iban, bic, mandate_ref, mandate_signed_on, types:membership_types(name), contacts!inner(*)")
          .eq("org_id", ctx.org.id)
          .is("deleted_at", null)
          .order("number")
          .range(from, to)
        if (status === "active") query = query.or(`ends_on.is.null,ends_on.gte.${now}`)
        if (status === "ended") query = query.lt("ends_on", now)
        if (type) query = query.eq("type_id", type)
        if (q) query = query.or(["first_name", "last_name", "company", "email"].map((c) => `${c}.ilike.%${q}%`).join(","), { referencedTable: "contacts" })
        return query
      })
      const memberCols = MEMBER_FIELDS.map((f) => f.key)
      return {
        headers: [...CONTACT_FIELDS.map((f) => label(t, f.label)), ...MEMBER_FIELDS.map((f) => label(t, f.label))],
        rows: rows.map((m) => [
          ...contactCells(m.contacts as unknown as Record<string, unknown>),
          ...memberCols.map((k) =>
            ({
              "membership.type": m.types?.name,
              "membership.starts_on": m.starts_on,
              "membership.ends_on": m.ends_on,
              "membership.number": m.member_no,
              "membership.account_holder": m.account_holder,
              "membership.iban": m.iban,
              "membership.bic": m.bic,
              "membership.mandate_ref": m.mandate_ref,
              "membership.mandate_signed_on": m.mandate_signed_on,
            })[k] ?? "",
          ),
        ]),
      }
    },
  },
  dues: {
    perm: "members.view",
    module: "members",
    name: "dues",
    async load(ctx, t, sp) {
      const status = sp.get("status") ?? "open"
      const rows = await all((from, to) => {
        let query = ctx.supabase
          .from("member_dues")
          .select("description, amount_cents, due_on, status, paid_on, memberships(member_no, contacts(first_name, last_name, company, email))")
          .eq("org_id", ctx.org.id)
          .order("due_on", { ascending: false })
          .range(from, to)
        if (status !== "all") query = query.eq("status", status)
        return query
      })
      return {
        headers: [t("membership.importNumber"), t("membership.name"), t("membership.levyText"), t("membership.dueOn"), t("membership.amount"), t("membership.status"), t("membership.paidOn")],
        rows: rows.map((d) => [
          d.memberships?.member_no,
          d.memberships?.contacts ? contactName(d.memberships.contacts) : "",
          d.description,
          d.due_on,
          d.amount_cents / 100,
          t.dynamic(`membership.dueStatus.${d.status}`),
          d.paid_on,
        ]),
      }
    },
  },
  submissions: {
    perm: "forms.view",
    module: "forms",
    name: "submissions",
    async load(ctx, t, sp) {
      const form = sp.get("form") ?? ""
      const rows = await all((from, to) =>
        ctx.supabase.from("form_submissions").select("created_at, status, data").eq("org_id", ctx.org.id).eq("form_id", form).order("created_at", { ascending: false }).range(from, to),
      )
      type Data = { contact?: Record<string, unknown>; custom?: Record<string, unknown>; membership?: Record<string, unknown>; consents?: { label: string; accepted: boolean }[] }
      const customKeys = [...new Set(rows.flatMap((r) => Object.keys((r.data as Data).custom ?? {})))]
      const memberKeys = [...new Set(rows.flatMap((r) => Object.keys((r.data as Data).membership ?? {})))]
      const consentLabels = [...new Set(rows.flatMap((r) => ((r.data as Data).consents ?? []).map((c) => c.label)))]
      return {
        headers: [t("forms.received"), t("forms.status"), ...CONTACT_FIELDS.filter((f) => f.key !== "tags").map((f) => label(t, f.label)), ...customKeys, ...memberKeys, ...consentLabels],
        rows: rows.map((r) => {
          const d = r.data as Data
          return [
            r.created_at.slice(0, 16).replace("T", " "),
            t.dynamic(`forms.subStatus.${r.status}`),
            ...contactCols.filter((k) => k !== "tags").map((k) => (d.contact?.[k] as string) ?? ""),
            ...customKeys.map((k) => String(d.custom?.[k] ?? "")),
            ...memberKeys.map((k) => String(d.membership?.[k] ?? "")),
            ...consentLabels.map((l) => (d.consents?.find((c) => c.label === l)?.accepted ? "✓" : "")),
          ]
        }),
      }
    },
  },
  "course-participants": {
    perm: "courses.view",
    module: "courses",
    name: "participants",
    async load(ctx, t, sp) {
      const course = sp.get("course") ?? ""
      const rows = await all((from, to) =>
        ctx.supabase
          .from("course_participants")
          .select("status, note, created_at, contacts(first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, tags)")
          .eq("org_id", ctx.org.id)
          .eq("course_id", course)
          .order("created_at")
          .range(from, to),
      )
      return {
        headers: [...CONTACT_FIELDS.map((f) => label(t, f.label)), t("courses.status"), t("courses.note")],
        rows: rows.map((r) => [...contactCells(r.contacts), t.dynamic(`courses.statuses.${r.status}`), r.note ?? ""]),
      }
    },
  },
  employees: {
    perm: "hr.view",
    module: "hr",
    name: "employees",
    async load(ctx, t) {
      const rows = await all((from, to) =>
        ctx.supabase
          .from("employees")
          .select("name, email, phone, job_title, department, employment_type, starts_on, ends_on, pay_type, hourly_rate_cents, monthly_salary_cents, weekly_hours, vacation_days, manager:manager_id(name)")
          .eq("org_id", ctx.org.id)
          .is("deleted_at", null)
          .order("name")
          .range(from, to),
      )
      return {
        headers: [t("hr.name"), t("hr.email"), t("hr.phone"), t("hr.jobTitle"), t("hr.department"), t("hr.manager"), t("hr.employmentType"), t("hr.startsOn"), t("hr.endsOn"), t("hr.payType"), t("hr.hourlyRate"), t("hr.monthlySalary"), t("hr.weeklyHours"), t("hr.vacationDays")],
        rows: rows.map((e) => [
          e.name,
          e.email,
          e.phone,
          e.job_title,
          e.department,
          (e.manager as { name: string } | null)?.name ?? "",
          t.dynamic(`hr.types.${e.employment_type}`),
          e.starts_on,
          e.ends_on,
          t.dynamic(`hr.payTypes.${e.pay_type}`),
          e.hourly_rate_cents != null ? e.hourly_rate_cents / 100 : "",
          e.monthly_salary_cents != null ? e.monthly_salary_cents / 100 : "",
          e.weekly_hours,
          e.vacation_days,
        ]),
      }
    },
  },
  // For the tax advisor / payroll software: approved hours, absences, gross preview (no taxes or contributions).
  payroll: {
    perm: "hr.view",
    module: "hr",
    name: "payroll",
    async load(ctx, t, sp) {
      const month = monthOf(sp.get("month") ?? undefined)
      const rows = await payrollMonth(ctx.supabase, ctx.org.id, month)
      return {
        headers: [t("hr.name"), t("hr.employmentType"), t("time.month"), t("hr.hours"), t("hr.hourlyRate"), t("hr.monthlySalary"), t("hr.grossShort"), t.dynamic("hr.kinds.vacation"), t.dynamic("hr.kinds.sick"), t("hr.otherAbsence"), t("hr.notesShort")],
        rows: rows.map((r) => [
          r.name,
          t.dynamic(`hr.types.${r.employment_type}`),
          month.month,
          Math.round((r.approved_minutes / 60) * 100) / 100,
          r.hourly_rate_cents != null ? r.hourly_rate_cents / 100 : "",
          r.monthly_salary_cents != null ? r.monthly_salary_cents / 100 : "",
          r.gross_cents != null ? r.gross_cents / 100 : "",
          r.vacation_days,
          r.sick_days,
          r.other_absence_days,
          [...r.warnings.map((w) => t.dynamic(`hr.payWarnings.${w}`)), ...(r.unapproved_entries ? [t("time.toApprove", { count: r.unapproved_entries })] : [])].join(", "),
        ]),
      }
    },
  },
  // Payroll: approved time only (entries still open for approval are left out; the hours page says how many).
  hours: {
    perm: "shifts.view",
    module: "shifts",
    name: "hours",
    async load(ctx, t, sp) {
      const rows = await approvedTime(ctx, sp)
      const people = new Map<string, { name: string; role: string; days: Set<string>; net: number; brk: number }>()
      for (const e of rows) {
        const p = people.get(e.staff_id) ?? { name: e.staff?.name ?? "", role: e.staff?.role_label ?? "", days: new Set(), net: 0, brk: 0 }
        const m = minutes(e)
        p.days.add(e.started_at.slice(0, 10))
        p.net += m.net
        p.brk += m.break
        people.set(e.staff_id, p)
      }
      return {
        headers: [t("shifts.name"), t("time.roleLabel"), t("time.month"), t("time.days"), t("time.hours"), t("time.breakMinutes")],
        rows: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.name, p.role, monthOf(sp.get("month") ?? undefined).month, p.days.size, Math.round((p.net / 60) * 100) / 100, p.brk]),
      }
    },
  },
  time: {
    perm: "shifts.view",
    module: "shifts",
    name: "time",
    async load(ctx, t, sp) {
      const rows = await approvedTime(ctx, sp)
      const at = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16)
      return {
        headers: [t("shifts.name"), t("time.start"), t("time.end"), t("time.breakMinutes"), t("time.hours"), t("time.what"), t("time.note")],
        rows: rows.map((e) => {
          const m = minutes(e)
          return [e.staff?.name ?? "", at(e.started_at), e.ended_at ? at(e.ended_at) : "", m.break, Math.round((m.net / 60) * 100) / 100, e.shifts?.positions?.name ?? e.shifts?.title ?? "", e.note ?? ""]
        }),
      }
    },
  },
}

async function approvedTime(ctx: Ctx, sp: URLSearchParams) {
  const month = monthOf(sp.get("month") ?? undefined)
  return all((from, to) =>
    ctx.supabase
      .from("time_entries")
      .select("id, staff_id, started_at, ended_at, break_minutes, note, staff(name, role_label), shifts(title, positions(name))")
      .eq("org_id", ctx.org.id)
      .not("approved_at", "is", null)
      .not("ended_at", "is", null)
      .gte("started_at", month.from)
      .lt("started_at", month.to)
      .order("started_at")
      .range(from, to),
  )
}
