// The App's main navigation as one tree: areas with sub-pages, related modules under one heading. The sidebar shows
// it (only the current area expanded), the ⌘K search lists its pages. A child shows when its module is on and the
// person has its permission; an area shows when it has a visible child and opens its first one.
import {
  BarChart3Icon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ContactIcon,
  GraduationCapIcon,
  IdCardIcon,
  KanbanSquareIcon,
  LandmarkIcon,
  MessagesSquareIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

type Child = { href: string; label: string; module: string | string[]; permission: string | string[] }
type Area = { key: string; label: string; icon: LucideIcon; children: Child[] }

export const NAV: Area[] = [
  {
    key: "contacts",
    label: "contacts.nav",
    icon: ContactIcon,
    children: [
      { href: "/contacts", label: "nav.overview", module: "crm", permission: "crm.view" },
    ],
  },
  {
    key: "members",
    label: "membership.nav",
    icon: IdCardIcon,
    children: [
      { href: "/members", label: "membership.tabs.members", module: "members", permission: "members.view" },
      { href: "/members/types", label: "membership.types", module: "members", permission: "members.manage" },
      { href: "/members/dues", label: "membership.tabs.dues", module: "members", permission: "members.view" },
      { href: "/members/settings", label: "common.settings", module: "members", permission: "members.manage" },
    ],
  },
  {
    key: "events",
    label: "nav.events",
    icon: CalendarDaysIcon,
    children: [
      { href: "/events", label: "nav.overview", module: "events", permission: "events.view" },
      { href: "/guestlists", label: "guestlists.nav", module: "guestlists", permission: "guestlists.view" },
      { href: "/scan", label: "tickets.scanNav", module: ["tickets", "guestlists"], permission: ["tickets.scan", "guestlists.checkin"] },
    ],
  },
  {
    key: "shifts",
    label: "shifts.nav",
    icon: CalendarClockIcon,
    children: [
      { href: "/shifts", label: "nav.overview", module: "shifts", permission: "shifts.view" },
      { href: "/shifts/me", label: "shifts.tabs.me", module: "shifts", permission: "shifts.self" },
      { href: "/shifts/hours", label: "shifts.tabs.hours", module: "shifts", permission: "shifts.view" },
      { href: "/shifts/team", label: "shifts.tabs.team", module: "shifts", permission: "shifts.view" },
      { href: "/shifts/settings", label: "common.settings", module: "shifts", permission: "shifts.manage" },
    ],
  },
  {
    key: "hr",
    label: "hr.nav",
    icon: BriefcaseBusinessIcon,
    children: [
      { href: "/hr", label: "nav.overview", module: "hr", permission: "hr.view" },
      { href: "/hr/absences", label: "hr.tabs.absences", module: "hr", permission: "hr.view" },
      { href: "/hr/chart", label: "hr.tabs.chart", module: "hr", permission: "hr.view" },
      { href: "/hr/payroll", label: "hr.tabs.payroll", module: "hr", permission: "hr.view" },
    ],
  },
  { key: "courses", label: "courses.nav", icon: GraduationCapIcon, children: [{ href: "/courses", label: "courses.nav", module: "courses", permission: "courses.view" }] },
  {
    key: "finance",
    label: "nav.finance",
    icon: LandmarkIcon,
    children: [
      { href: "/invoices", label: "invoices.nav", module: "invoices", permission: "invoices.view" },
      { href: "/cashbook", label: "cashbook.nav", module: "cashbook", permission: "cashbook.view" },
      { href: "/payments", label: "payments.nav", module: "payments", permission: "payments.view" },
      { href: "/invoices/settings", label: "common.settings", module: "invoices", permission: "invoices.manage" },
    ],
  },
  {
    key: "communication",
    label: "nav.communication",
    icon: MessagesSquareIcon,
    children: [
      { href: "/email", label: "nav.campaigns", module: "email", permission: "email.view" },
      { href: "/email/automations", label: "nav.emailAutomations", module: "email", permission: "email.view" },
      { href: "/email/log", label: "nav.emailLog", module: "email", permission: "email.view" },
      { href: "/forms", label: "forms.nav", module: "forms", permission: "forms.view" },
    ],
  },
  { key: "automations", label: "automations.nav", icon: WorkflowIcon, children: [{ href: "/automations", label: "automations.nav", module: "automations", permission: "automations.view" }] },
  {
    key: "projects",
    label: "projects.nav",
    icon: KanbanSquareIcon,
    children: [
      { href: "/projects", label: "nav.overview", module: "projects", permission: "projects.view" },
      { href: "/projects/settings", label: "common.settings", module: "projects", permission: "projects.manage" },
    ],
  },
  { key: "wiki", label: "wiki.nav", icon: BookOpenIcon, children: [{ href: "/wiki", label: "wiki.nav", module: "wiki", permission: "wiki.view" }] },
  { key: "reports", label: "reports.nav", icon: BarChart3Icon, children: [{ href: "/reports", label: "reports.nav", module: "reports", permission: "reports.view" }] },
]

/** The areas this person sees: visible children only, areas without any dropped. */
export function visibleNav(on: (module: string) => boolean, can: (perm: string) => boolean) {
  return NAV.map((a) => ({ ...a, children: a.children.filter((c) => [c.module].flat().some(on) && [c.permission].flat().some(can)) })).filter((a) => a.children.length)
}
