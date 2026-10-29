// Sections of the settings (navigation beside the page).
export const SETTINGS_TABS: { key: string; permission?: string }[] = [
  { key: "profile" },
  { key: "general" },
  { key: "team" },
  { key: "roles" },
  { key: "modules" },
  { key: "areas" },
  { key: "fields" },
  { key: "locations" },
  { key: "integrations", permission: "org.integrations.manage" },
  { key: "api", permission: "org.integrations.manage" },
]
