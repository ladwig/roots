import { redirect } from "next/navigation"

export default function SettingsPage() {
  redirect("/settings/general")
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
