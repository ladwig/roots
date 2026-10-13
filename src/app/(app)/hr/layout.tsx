import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("hr.nav")

// People, absences, org chart and payroll are sub-items in the sidebar (src/modules/nav.ts).
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("hr.view")
  if (!ctx.modules.has("hr")) notFound()
  return <div className="grid max-w-5xl gap-6">{children}</div>
}

export const instant = false
