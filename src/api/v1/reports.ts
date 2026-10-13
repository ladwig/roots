import { z } from "zod"
import { berlinToday } from "./shared"
import { dbError, endpoint, type Endpoint } from "../core"
import { PRESETS, period } from "@/reports/period"
import { loadReport } from "@/reports/server"

const n = z.number()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/reports",
    permission: "reports.view",
    tag: "Reports",
    summary: "KPIs for a period",
    description:
      "Same numbers as Reports in the App, for a preset (`period`) or a custom range (`from`/`to`, Berlin days, `to` inclusive; max. 10 years). A section is only included when its module is on and the key may view that module (e.g. `members` needs members.view). Money in cents.",
    query: z.object({ period: z.enum(PRESETS).optional().describe("Default: month (the current month)"), from: day.optional(), to: day.optional() }),
    response: z
      .object({
        from: day,
        to: day,
        contacts: z.object({ total: n, new: n }).optional(),
        members: z.record(z.string(), z.unknown()).optional().describe("active, joined, left, paused, fee_free, by_type, months, dues_open_cents, dues_overdue_cents, dues_overdue_people, dues_paid_cents"),
        events: z.record(z.string(), z.unknown()).optional().describe("count, sold, revenue_cents, tickets_in, members_in, guests_in, members_by_type, list (per event)"),
        payments: z.object({ orders: n, gross_cents: n, by_source: z.record(z.string(), n) }).optional(),
        shifts: z.object({ count: n, needed: n, assigned: n, worked_minutes: n }).optional(),
        forms: z.object({ submissions: n }).optional(),
        invoices: z.object({ issued: n, issued_cents: n, paid_cents: n, open_cents: n, overdue_cents: n }).optional(),
        courses: z.object({ courses: n, enrolled: n, waiting: n }).optional(),
        email: z.object({ sent: n, delivered: n, bounced: n, complained: n }).optional(),
      })
      .passthrough(),
    async handler({ db, orgId, query }) {
      const p = period(berlinToday(), query.period, query.from, query.to)
      try {
        return await loadReport(db, orgId, p.from, p.to)
      } catch (e) {
        throw dbError(e as { message: string; code?: string })
      }
    },
  }),
]
