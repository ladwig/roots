import { z } from "zod"
import { ABSENCE_KINDS, EMPLOYMENT_TYPES, PAY_TYPES, readAbsence, readEmployee, readPrivate } from "@/hr/fields"
import { payrollMonth } from "@/hr/server"
import { monthOf } from "@/lib/time"
import type { TablesUpdate } from "@/lib/supabase/types"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { day, ts, type Db } from "./shared"

// HR: employees, personal data (hr.manage only), absences, payroll preview. Validation = the App's (src/hr/fields.ts).
const TAG = "HR"
const Employee = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  job_title: z.string().nullable(),
  department: z.string().nullable(),
  manager_id: uuid.nullable().describe("Reports to (org chart)"),
  staff_id: uuid.nullable().describe("Shift team member of the same user (approved hours come from there)"),
  user_id: uuid.nullable().describe("The org member this employee is"),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  starts_on: day.nullable(),
  ends_on: day.nullable(),
  pay_type: z.enum(PAY_TYPES),
  hourly_rate_cents: z.number().int().nullable(),
  monthly_salary_cents: z.number().int().nullable(),
  weekly_hours: z.number().nullable(),
  vacation_days: z.number().nullable().describe("Per year"),
  notes: z.string().nullable(),
  created_at: ts,
  updated_at: ts,
})
const EMP_COLS = "id, name, email, phone, job_title, department, manager_id, staff_id, user_id, employment_type, starts_on, ends_on, pay_type, hourly_rate_cents, monthly_salary_cents, weekly_hours, vacation_days, notes, created_at, updated_at"
const EmployeeInput = z
  .object({
    name: z.string().max(200),
    email: z.string().max(320).nullable(),
    phone: z.string().max(50).nullable(),
    job_title: z.string().max(100).nullable(),
    department: z.string().max(100).nullable(),
    manager_id: uuid.nullable(),
    staff_id: uuid.nullable(),
    employment_type: z.enum(EMPLOYMENT_TYPES),
    starts_on: day.nullable(),
    ends_on: day.nullable(),
    pay_type: z.enum(PAY_TYPES),
    hourly_rate_cents: z.number().int().min(0).max(100_000_00).nullable(),
    monthly_salary_cents: z.number().int().min(0).max(100_000_00).nullable(),
    weekly_hours: z.number().min(0).max(80).nullable(),
    vacation_days: z.number().min(0).max(365).nullable(),
    notes: z.string().max(5000).nullable(),
  })
  .partial()
  .strict()
const Private = z.object({
  birthday: day.nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2"),
  nationality: z.string().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  tax_id: z.string().nullable().describe("Steuer-ID, 11 digits"),
  tax_class: z.string().nullable(),
  social_security_no: z.string().nullable(),
  health_insurance: z.string().nullable(),
  emergency_contact: z.string().nullable(),
})
const PRIVATE_COLS = "birthday, street, postal_code, city, country, nationality, iban, bic, tax_id, tax_class, social_security_no, health_insurance, emergency_contact"
const Absence = z.object({ id: uuid, employee_id: uuid, kind: z.enum(ABSENCE_KINDS), starts_on: day, ends_on: day, half_day: z.boolean(), note: z.string().nullable(), created_at: ts, updated_at: ts })
const ABS_COLS = "id, employee_id, kind, starts_on, ends_on, half_day, note, created_at, updated_at"
const AbsenceInput = z.object({ kind: z.enum(ABSENCE_KINDS), starts_on: day, ends_on: day, half_day: z.boolean(), note: z.string().max(500).nullable() }).partial().strict()

// JSON → the form-style getter the shared parsers use (cents → "12.34", null → "").
const getter = (o: Record<string, unknown>) => (k: string) => {
  const cents: Record<string, string> = { hourly_rate: "hourly_rate_cents", monthly_salary: "monthly_salary_cents" }
  const v = cents[k] ? (o[cents[k]] == null ? null : (Number(o[cents[k]]) / 100).toFixed(2)) : o[k]
  return v == null ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
}
const invalid = (r: { error: string; field?: string }) => new ApiError(422, r.error.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), r.field ? `${r.field}: ${r.error}` : r.error)
async function refsOk(db: Db, orgId: string, row: { staff_id?: string | null; manager_id?: string | null }) {
  const [{ data: staff }, { data: manager }] = await Promise.all([
    row.staff_id ? db.from("staff").select("id, user_id").eq("id", row.staff_id).eq("org_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
    row.manager_id ? db.from("employees").select("id").eq("id", row.manager_id).eq("org_id", orgId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if ((row.staff_id && !staff) || (row.manager_id && !manager)) throw new ApiError(422, "invalid_reference", "staff_id or manager_id does not belong to this organisation.")
  return staff?.user_id ?? null
}
async function employeeOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("employees").select(EMP_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return data
}
const conflict = (e: { code?: string; message: string }) => (e.code === "23505" ? new ApiError(409, "already_employee", "This member is already an employee.") : dbError(e))

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/employees",
    permission: "hr.view",
    tag: TAG,
    summary: "List employees",
    query: page.extend({ q: z.string().max(100).optional(), active: z.enum(["true", "false"]).optional().describe("true = not left yet") }),
    response: list(Employee),
    async handler({ db, orgId, query }) {
      let q = db.from("employees").select(EMP_COLS).eq("org_id", orgId).is("deleted_at", null).order("name").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(`name.ilike.%${s}%,job_title.ilike.%${s}%,department.ilike.%${s}%`)
      const today = new Date().toISOString().slice(0, 10)
      if (query.active === "true") q = q.or(`ends_on.is.null,ends_on.gte.${today}`)
      if (query.active === "false") q = q.lt("ends_on", today)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/employees/{id}",
    permission: "hr.view",
    tag: TAG,
    summary: "Get an employee",
    response: Employee,
    async handler({ db, orgId, params }) {
      return employeeOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/employees",
    permission: "hr.manage",
    tag: TAG,
    summary: "Add an employee",
    description: "Employees are org members: `user_id` of a member (name and email come from their profile; their shift team row is linked).",
    body: EmployeeInput.omit({ name: true, email: true, staff_id: true }).extend({ user_id: uuid }).strict(),
    response: Employee,
    status: 201,
    async handler({ db, orgId, body }) {
      const [{ data: member }, { data: profile }, { data: staff }] = await Promise.all([
        db.from("org_members").select("user_id").eq("org_id", orgId).eq("user_id", body.user_id).maybeSingle(),
        db.from("profiles").select("full_name, email").eq("id", body.user_id).maybeSingle(),
        db.from("staff").select("id").eq("org_id", orgId).eq("user_id", body.user_id).maybeSingle(),
      ])
      if (!member) throw new ApiError(422, "not_a_member", "user_id must be a member of this organisation.")
      const r = readEmployee(getter({ ...body, name: profile?.full_name || profile?.email || "–", email: profile?.email ?? null }))
      if ("error" in r) throw invalid(r)
      await refsOk(db, orgId, { manager_id: r.row.manager_id })
      const { data, error } = await db.from("employees").insert({ ...r.row, user_id: body.user_id, staff_id: staff?.id ?? null, org_id: orgId }).select(EMP_COLS).single()
      if (error) throw conflict(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/employees/{id}",
    permission: "hr.manage",
    tag: TAG,
    summary: "Change an employee",
    description: "Only the given fields change. The linked member (name, email, shift team) stays.",
    body: EmployeeInput.omit({ name: true, email: true, staff_id: true }),
    response: Employee,
    async handler({ db, orgId, params, body }) {
      const old = await employeeOf(db, orgId, params.id)
      const r = readEmployee(getter({ ...old, ...body }))
      if ("error" in r) throw invalid(r)
      await refsOk(db, orgId, { manager_id: r.row.manager_id })
      if (r.row.manager_id === params.id) throw new ApiError(422, "invalid_reference", "Someone can't report to themselves.")
      const contract = Object.fromEntries(Object.entries(r.row).filter(([k]) => !["name", "email", "staff_id", "user_id"].includes(k))) as TablesUpdate<"employees">
      const { data, error } = await db.from("employees").update(contract).eq("id", params.id).eq("org_id", orgId).select(EMP_COLS).single()
      if (error) throw conflict(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/employees/{id}",
    permission: "hr.manage",
    tag: TAG,
    summary: "Move an employee to the trash",
    description: "Restorable for 30 days.",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await employeeOf(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.employees", p_id: params.id })
      if (error) throw dbError(error)
      return { ok: true }
    },
  }),
  endpoint({
    method: "POST",
    path: "/employees/{id}/restore",
    permission: "hr.manage",
    tag: TAG,
    summary: "Restore an employee from the trash",
    response: Employee,
    async handler({ db, orgId, params }) {
      const { data: row } = await db.from("employees").select("id").eq("id", params.id).eq("org_id", orgId).not("deleted_at", "is", null).maybeSingle()
      if (!row) throw notFound()
      const { error } = await db.rpc("restore_deleted", { p_table: "public.employees", p_id: params.id })
      if (error) throw conflict(error)
      return employeeOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "GET",
    path: "/employees/{id}/private",
    permission: "hr.manage",
    tag: TAG,
    summary: "Personal data of an employee",
    description: "Address, bank, tax and social security data. Empty fields when nothing is stored yet.",
    response: Private,
    async handler({ db, orgId, params }) {
      await employeeOf(db, orgId, params.id)
      const { data } = await db.from("employee_private").select(PRIVATE_COLS).eq("employee_id", params.id).eq("org_id", orgId).maybeSingle()
      return data ?? Object.fromEntries(Object.keys(Private.shape).map((k) => [k, null]))
    },
  }),
  endpoint({
    method: "PUT",
    path: "/employees/{id}/private",
    permission: "hr.manage",
    tag: TAG,
    summary: "Set the personal data of an employee",
    description: "Replaces all personal data (send every field; missing = empty).",
    body: Private.partial().strict(),
    response: Private,
    async handler({ db, orgId, params, body }) {
      await employeeOf(db, orgId, params.id)
      const r = readPrivate(getter(body))
      if ("error" in r) throw invalid(r)
      const { data, error } = await db.from("employee_private").upsert({ ...r.row, org_id: orgId, employee_id: params.id }, { onConflict: "employee_id" }).select(PRIVATE_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/absences",
    permission: "hr.view",
    tag: TAG,
    summary: "List absences",
    description: "Overlapping the period `from`–`to` (dates, inclusive).",
    query: page.extend({ employee_id: uuid.optional(), kind: z.enum(ABSENCE_KINDS).optional(), from: day.optional(), to: day.optional() }),
    response: list(Absence),
    async handler({ db, orgId, query }) {
      let q = db.from("absences").select(ABS_COLS).eq("org_id", orgId).order("starts_on").range(query.offset, query.offset + query.limit)
      if (query.employee_id) q = q.eq("employee_id", query.employee_id)
      if (query.kind) q = q.eq("kind", query.kind)
      if (query.from) q = q.gte("ends_on", query.from)
      if (query.to) q = q.lte("starts_on", query.to)
      const { data } = await q
      return paged(data, query)
    },
  }),
  endpoint({
    method: "POST",
    path: "/absences",
    permission: "hr.manage",
    tag: TAG,
    summary: "Record an absence",
    body: AbsenceInput.extend({ employee_id: uuid }).required({ kind: true, starts_on: true }),
    response: Absence,
    status: 201,
    async handler({ db, orgId, body }) {
      await employeeOf(db, orgId, body.employee_id)
      const r = readAbsence(getter(body))
      if ("error" in r) throw invalid(r)
      const { data, error } = await db.from("absences").insert({ ...r.row, employee_id: body.employee_id, org_id: orgId }).select(ABS_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/absences/{id}",
    permission: "hr.manage",
    tag: TAG,
    summary: "Change an absence",
    body: AbsenceInput,
    response: Absence,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("absences").select(ABS_COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const r = readAbsence(getter({ ...old, ...body }))
      if ("error" in r) throw invalid(r)
      const { data, error } = await db.from("absences").update(r.row).eq("id", params.id).eq("org_id", orgId).select(ABS_COLS).single()
      if (error) throw dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/absences/{id}",
    permission: "hr.manage",
    tag: TAG,
    summary: "Delete an absence",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("absences").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw notFound()
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/payroll",
    permission: "hr.view",
    tag: TAG,
    summary: "Payroll preparation for a month",
    description: "Per employee: approved hours (from shift time tracking), absence days, gross preview and warnings (minijob_over, below_min_wage, no_rate). No taxes or contributions.",
    query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM, default this month") }),
    response: z.object({
      month: z.string(),
      data: z.array(
        z.object({
          employee_id: uuid,
          name: z.string(),
          employment_type: z.string(),
          pay_type: z.string(),
          hourly_rate_cents: z.number().int().nullable(),
          monthly_salary_cents: z.number().int().nullable(),
          approved_minutes: z.number().int(),
          unapproved_entries: z.number().int(),
          vacation_days: z.number(),
          sick_days: z.number(),
          other_absence_days: z.number(),
          gross_cents: z.number().int().nullable(),
          warnings: z.array(z.string()),
        }),
      ),
    }),
    async handler({ db, orgId, query }) {
      const month = monthOf(query.month)
      return { month: month.month, data: await payrollMonth(db, orgId, month) }
    },
  }),
]
