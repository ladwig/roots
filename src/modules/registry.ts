// Module definitions. The DB only stores which org has which module on (org_modules);
// everything else about a module lives here. Names, descriptions and permission labels are in
// src/i18n/messages (modules.<key>.name / .description, permissions.<permission>).
// Permission keys start with the module key ("events.manage"), so a role can grant a whole module with "events.*".
// ponytail: one file while modules are just definitions; move each to src/modules/<key>/ once it has code.

export type NavItem = { href: string; label: string; permission?: string } // label = message key
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
  ],
}

export const modules: ModuleDef[] = [
  { key: "crm", permissions: ["crm.view", "crm.manage"] },
  {
    key: "payments",
    requires: { integrations: ["stripe"] },
    permissions: ["payments.view", "payments.refund"],
    nav: [{ href: "/payments", label: "payments.nav", permission: "payments.view" }],
  },
  { key: "events", permissions: ["events.view", "events.manage"], nav: [{ href: "/events", label: "eventsPage.nav", permission: "events.view" }] },
  {
    key: "tickets",
    requires: { modules: ["events", "payments"] },
    permissions: ["tickets.view", "tickets.manage", "tickets.scan"],
  },
  { key: "guestlists", requires: { modules: ["events"] }, permissions: ["guestlists.view", "guestlists.manage"] },
  { key: "shifts", permissions: ["shifts.view", "shifts.manage"] },
  { key: "sites", permissions: ["sites.manage"] },
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
