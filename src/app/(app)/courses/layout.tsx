import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("courses.nav")

export default async function CoursesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("courses.view")
  if (!ctx.modules.has("courses")) notFound()
  return <div className="grid max-w-5xl gap-6">{children}</div>
}

export const instant = false
