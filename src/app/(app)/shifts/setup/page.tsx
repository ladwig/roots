import { redirect } from "next/navigation"

// Old address (before area settings were called "Einstellungen" everywhere).
export default function OldSetup() {
  redirect("/shifts/settings")
}
