import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"
import { titled } from "@/lib/title"

export const generateMetadata = titled("store.nav")

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePerm("shop.view")
  if (!ctx.modules.has("shop")) notFound()
  return <div className="grid max-w-6xl gap-6">{children}</div>
}

export const instant = false
