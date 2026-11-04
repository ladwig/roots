"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { confirmDiscard } from "@/components/save-bar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/client"

// A dialog that exists because a search param is set (?edit=…, ?new=…). Closing removes the param(s).
export function UrlDialog({
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
  const t = useT()

  const close = () => {
    if (!confirmDiscard(document.querySelector("[data-slot=dialog-content]"), t("common.discardUnsaved"))) return
    const next = new URLSearchParams(searchParams)
    for (const p of [...params, "error", "ok"]) next.delete(p)
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
