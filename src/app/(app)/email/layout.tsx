import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("email.nav")

// Campaigns, automations and the send log are sub-items in the sidebar (src/modules/nav.ts).
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("email.view")
  if (!ctx.modules.has("email")) notFound()
  return <div className="grid max-w-5xl gap-6">{children}</div>
}

export const instant = false
