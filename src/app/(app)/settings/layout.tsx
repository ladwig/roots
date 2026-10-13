import { titled } from "@/lib/title"
import { SettingsTitle } from "./section-title"

export const generateMetadata = titled("shell.settings")

// The sections are sub-items in the sidebar (./tabs.ts).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-4xl gap-6">
      <SettingsTitle />
      {children}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
