import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("projects.nav")

export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("projects.view")
  if (!ctx.modules.has("projects")) notFound()
  return <div className="grid gap-6">{children}</div>
}

export const instant = false
