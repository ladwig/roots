"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

// A side drawer that exists because a search param is set (?edit=<id>, ?new=…). Closing removes the param(s).
// Same anatomy everywhere: title, `meta` underneath (small, muted: "Angelegt am …"; live save status of an autosave
// form lands here too, via the sheet-status slot), then one action row: `actions` (the main action, if any) and
// `menu` (the ⋯ <ActionsMenu>, deleting = destructive item at the end). The form's save bar sits at the bottom.
export function UrlSheet({
  params,
  title,
  description,
  meta,
  actions,
  menu,
  children,
  wide,
}: {
  params: string[]
  wide?: boolean // e.g. an import with a preview table
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  menu?: React.ReactNode
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
      <SheetContent className={wide ? "w-full overflow-y-auto sm:max-w-3xl" : "w-full overflow-y-auto sm:max-w-md"}>
        <SheetHeader className="gap-1.5">
          <SheetTitle className="pr-8">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {meta}
            <span data-slot="sheet-status" className="contents" />
          </div>
          {(actions || menu) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {actions}
              <span className="ml-auto">{menu}</span>
            </div>
          )}
        </SheetHeader>
        <div className="grid gap-6 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
