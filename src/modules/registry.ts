// Module definitions. The DB only stores which org has which module on (org_modules);
// everything else about a module lives here. Permission keys must start with the module key ("events.manage"),
// so a role can grant a whole module with "events.*".
// ponytail: one file while modules are just definitions; move each to src/modules/<key>/ once it has code.

export type Permission = { key: string; label: string }
export type NavItem = { href: string; label: string; permission?: string }
export type ModuleDef = {
  key: string
  name: string
  description: string
  requires?: { modules?: string[]; integrations?: string[] }
  permissions: Permission[]
  nav?: NavItem[]
}

// Always on, can't be disabled.
export const core: ModuleDef = {
  key: "org",
  name: "Organisation",
  description: "Settings, members, roles, modules, integrations and activity.",
  permissions: [
    { key: "org.settings.manage", label: "Edit organisation settings" },
    { key: "org.members.manage", label: "Invite and manage members" },
    { key: "org.roles.manage", label: "Create and edit roles" },
    { key: "org.modules.manage", label: "Turn modules on and off" },
    { key: "org.integrations.manage", label: "Connect integrations" },
    { key: "org.audit.view", label: "View the activity log" },
  ],
}

export const modules: ModuleDef[] = [
  {
    key: "crm",
    name: "CRM",
    description: "Tags, notes and history for your contacts.",
    permissions: [
      { key: "crm.view", label: "View contacts" },
      { key: "crm.manage", label: "Edit contacts" },
    ],
  },
  {
    key: "payments",
    name: "Payments",
    description: "Take payments and refunds through your own Stripe account.",
    requires: { integrations: ["stripe"] },
    permissions: [
      { key: "payments.view", label: "View orders and payments" },
      { key: "payments.refund", label: "Issue refunds" },
    ],
  },
  {
    key: "events",
    name: "Events",
    description: "Plan events with dates, venues and lineups.",
    permissions: [
      { key: "events.view", label: "View events" },
      { key: "events.manage", label: "Create and edit events" },
    ],
  },
  {
    key: "tickets",
    name: "Ticketing",
    description: "Sell tickets with tiers, group deals and a door scanner.",
    requires: { modules: ["events", "payments"] },
    permissions: [
      { key: "tickets.view", label: "View ticket sales" },
      { key: "tickets.manage", label: "Set up tickets and prices" },
      { key: "tickets.scan", label: "Scan tickets at the door" },
    ],
  },
  {
    key: "guestlists",
    name: "Guest lists",
    description: "Guest and artist lists with links promoters fill in themselves.",
    requires: { modules: ["events"] },
    permissions: [
      { key: "guestlists.view", label: "View guest lists" },
      { key: "guestlists.manage", label: "Manage guest lists and links" },
    ],
  },
  {
    key: "shifts",
    name: "Shift planning",
    description: "Plan shifts and let members sign up and swap.",
    permissions: [
      { key: "shifts.view", label: "View shifts" },
      { key: "shifts.manage", label: "Plan shifts" },
    ],
  },
  {
    key: "sites",
    name: "Public site",
    description: "Pages on your own subdomain, built from blocks.",
    permissions: [{ key: "sites.manage", label: "Edit public pages" }],
  },
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
