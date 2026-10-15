import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("rentals.nav")

// Overview (objects), Vergaben and Belegung are sub-items in the sidebar (src/modules/nav.ts).
export default async function RentalsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("rentals.view")
  if (!ctx.modules.has("rentals")) notFound()
  return <div className="grid max-w-6xl gap-6">{children}</div>
}

export const instant = false
