import { redirect } from "next/navigation"

// /settings on its own: the first section (same target as the top bar's Einstellungen button).
export default function SettingsIndex() {
  redirect("/settings/profile")
}
