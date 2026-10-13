// Sections of the settings (sub-items in the sidebar).
export const SETTINGS_TABS: { key: string; permission?: string }[] = [
  { key: "profile" },
  { key: "general" },
  { key: "team" },
  { key: "roles" },
  { key: "modules" },
  { key: "fields" },
  { key: "locations" },
  { key: "integrations", permission: "org.integrations.manage" },
  { key: "api", permission: "org.integrations.manage" },
]
