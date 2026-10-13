// Module definitions. The DB only stores which org has which module on (org_modules);
// everything else about a module lives here. Names, descriptions and permission labels are in
// src/i18n/messages (modules.<key>.name / .description, permissions.<permission>).
// Permission keys start with the module key ("events.manage"), so a role can grant a whole module with "events.*".
// ponytail: one file while modules are just definitions; move each to src/modules/<key>/ once it has code.

import { BarChart3Icon, WalletIcon, BriefcaseBusinessIcon, GraduationCapIcon, WorkflowIcon, CalendarClockIcon, CalendarDaysIcon, ClipboardListIcon, ContactIcon, CreditCardIcon, FileTextIcon, IdCardIcon, ListChecksIcon, MailIcon, ScanLineIcon, type LucideIcon } from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: string | string[]; newTab?: boolean } // label = message key; several permissions = any of them
export type ModuleDef = {
  key: string
  requires?: { modules?: string[]; integrations?: string[] }
  permissions: string[]
  nav?: NavItem[]
}

// Always on, can't be disabled.
export const core: ModuleDef = {
  key: "org",
  permissions: [
    "org.settings.manage",
    "org.members.manage",
    "org.integrations.manage",
    "org.files.view",
    "org.files.manage",
  ],
}

// Core permissions an API key may carry (data an org may want to sync), next to the enabled modules' ones.
// Settings, integrations, team and roles stay in the App (a key never changes the org's setup or people's access).
export const apiCorePermissions = ["org.files.view", "org.files.manage"]

export const modules: ModuleDef[] = [
  { key: "crm", permissions: ["crm.view", "crm.manage"], nav: [{ href: "/contacts", label: "contacts.nav", icon: ContactIcon, permission: "crm.view" }] },
  {
    key: "payments",
    requires: { integrations: ["stripe"] },
    permissions: ["payments.view", "payments.refund"],
    nav: [{ href: "/payments", label: "payments.nav", icon: CreditCardIcon, permission: "payments.view" }],
  },
  { key: "events", permissions: ["events.view", "events.manage"], nav: [{ href: "/events", label: "eventsPage.nav", icon: CalendarDaysIcon, permission: "events.view" }] },
  {
    key: "tickets",
    requires: { modules: ["events", "payments"] },
    permissions: ["tickets.view", "tickets.manage", "tickets.scan"],
    nav: [{ href: "/scan", label: "tickets.scanNav", icon: ScanLineIcon, permission: "tickets.scan" }],
  },
  {
    key: "guestlists",
    requires: { modules: ["events"] },
    permissions: ["guestlists.view", "guestlists.manage", "guestlists.checkin"],
    nav: [
      { href: "/guestlists", label: "guestlists.nav", icon: ListChecksIcon, permission: "guestlists.view" },
      { href: "/scan", label: "tickets.scanNav", icon: ScanLineIcon, permission: "guestlists.checkin" },
    ],
  },
  { key: "invoices", permissions: ["invoices.view", "invoices.manage"], nav: [{ href: "/invoices", label: "invoices.nav", icon: FileTextIcon, permission: "invoices.view" }] },
  {
    key: "shifts",
    permissions: ["shifts.view", "shifts.manage", "shifts.approve", "shifts.self"],
    // One entry: planners get the plan (with a "my shifts" tab), everyone else lands on their own shifts.
    nav: [{ href: "/shifts", label: "shifts.nav", icon: CalendarClockIcon, permission: ["shifts.view", "shifts.self"] }],
  },
  {
    key: "members",
    requires: { modules: ["crm"] },
    permissions: ["members.view", "members.manage"],
    nav: [{ href: "/members", label: "membership.nav", icon: IdCardIcon, permission: "members.view" }],
  },
  {
    key: "forms",
    requires: { modules: ["crm"] },
    permissions: ["forms.view", "forms.manage"],
    nav: [{ href: "/forms", label: "forms.nav", icon: ClipboardListIcon, permission: "forms.view" }],
  },
  {
    key: "email",
    requires: { modules: ["crm"] },
    permissions: ["email.view", "email.manage"],
    nav: [{ href: "/email", label: "email.nav", icon: MailIcon, permission: "email.view" }],
  },
  {
    key: "automations",
    permissions: ["automations.view", "automations.manage"],
    nav: [{ href: "/automations", label: "automations.nav", icon: WorkflowIcon, permission: "automations.view" }],
  },
  {
    key: "courses",
    requires: { modules: ["crm"] },
    permissions: ["courses.view", "courses.manage"],
    nav: [{ href: "/courses", label: "courses.nav", icon: GraduationCapIcon, permission: "courses.view" }],
  },
  {
    key: "hr",
    permissions: ["hr.view", "hr.manage"], // hr.manage also sees personal data (address, bank, tax, social security)
    nav: [{ href: "/hr", label: "hr.nav", icon: BriefcaseBusinessIcon, permission: "hr.view" }],
  },
  { key: "cashbook", permissions: ["cashbook.view", "cashbook.manage"], nav: [{ href: "/cashbook", label: "cashbook.nav", icon: WalletIcon, permission: "cashbook.view" }] },
  { key: "reports", permissions: ["reports.view"], nav: [{ href: "/reports", label: "reports.nav", icon: BarChart3Icon, permission: "reports.view" }] },
]

export const getModule = (key: string) => modules.find((m) => m.key === key)

// Modules (transitively) required by `key` that aren't enabled yet.
export function missingModules(key: string, enabled: Set<string>): string[] {
  const missing = new Set<string>()
  const visit = (k: string) => {
    for (const dep of getModule(k)?.requires?.modules ?? []) {
      if (!enabled.has(dep) && !missing.has(dep)) {
        missing.add(dep)
        visit(dep)
      }
    }
  }
  visit(key)
  return [...missing]
}

// Enabled modules that depend on `key` (block turning it off).
export const dependents = (key: string, enabled: Set<string>) =>
  modules.filter((m) => enabled.has(m.key) && m.requires?.modules?.includes(key)).map((m) => m.key)
