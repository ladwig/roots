import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("membership.nav")

// Overview, dues, import and setup are sub-items in the sidebar (src/modules/nav.ts).
export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("members.view")
  if (!ctx.modules.has("members")) notFound()
  return <div className="grid max-w-5xl gap-6">{children}</div>
}

export const instant = false
