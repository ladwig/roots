"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

// A side drawer that exists because a search param is set (?edit=<id>, ?new=…). Closing removes the param(s).
export function UrlSheet({
  params,
  title,
  description,
  children,
}: {
  params: string[]
  title: string
  description?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const close = () => {
    const next = new URLSearchParams(searchParams)
    for (const p of [...params, "error", "ok"]) next.delete(p)
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="grid gap-6 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
