import { titled } from "@/lib/title"

export const generateMetadata = titled("shifts.nav")

// Plan, own shifts, hours, team and setup are sub-items in the sidebar (src/modules/nav.ts).
export default function ShiftsLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid max-w-5xl gap-6">{children}</div>
}
