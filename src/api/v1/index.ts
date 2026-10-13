// API v1 endpoints, one file per module. Every handler filters by orgId (see core.ts). Add an endpoint = one entry
// in the module's file; a new module file = one line here.
import type { Endpoint } from "../core"
import { endpoints as automations } from "./automations"
import { endpoints as cashbook } from "./cashbook"
import { endpoints as contacts } from "./contacts"
import { endpoints as courses } from "./courses"
import { endpoints as email } from "./email"
import { endpoints as events } from "./events"
import { endpoints as files } from "./files"
import { endpoints as forms } from "./forms"
import { endpoints as guestlists } from "./guestlists"
import { endpoints as hr } from "./hr"
import { endpoints as invoices } from "./invoices"
import { endpoints as members } from "./members"
import { endpoints as payments } from "./payments"
import { endpoints as reports } from "./reports"
import { endpoints as settings } from "./settings"
import { endpoints as shifts } from "./shifts"
import { endpoints as tickets } from "./tickets"

export const endpoints: Endpoint[] = [
  ...events,
  ...tickets,
  ...guestlists,
  ...contacts,
  ...members,
  ...forms,
  ...email,
  ...invoices,
  ...cashbook,
  ...payments,
  ...shifts,
  ...hr,
  ...courses,
  ...automations,
  ...reports,
  ...files,
  ...settings,
]
