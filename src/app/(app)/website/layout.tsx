import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("website.nav")

// Website area: overview, brand, pages, domain (sub-items in the sidebar, src/modules/nav.ts).
export default async function WebsiteLayout({ children }: { children: React.ReactNode }) {
  await requirePerm("org.site.manage")
  return <div className="grid max-w-6xl gap-6">{children}</div>
}

export const instant = false
