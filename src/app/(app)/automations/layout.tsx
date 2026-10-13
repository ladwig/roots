import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("automations.nav")

export default async function AutomationsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("automations.view")
  if (!ctx.modules.has("automations")) notFound()
  return <div className="grid max-w-6xl gap-6">{children}</div>
}

export const instant = false
