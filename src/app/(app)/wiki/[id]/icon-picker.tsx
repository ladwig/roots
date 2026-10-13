"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { SmilePlusIcon } from "lucide-react"
import { toast } from "sonner"
import { EmojiPicker } from "@/components/emoji-picker"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { setIconAction } from "../actions"

// Page icon: a square in front of the title (the emoji, or an empty outlined square), click = emoji picker.
export function IconPicker({ pageId, icon }: { pageId: string; icon: string | null }) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(icon)
  const [pending, start] = useTransition()
  const pick = (next: string | null) =>
    start(async () => {
      const r = await setIconAction({ id: pageId, icon: next })
      if (r.error) return void toast.error(r.error)
      setValue(next)
      setOpen(false)
      router.refresh() // tree + other places
    })
  const label = value ? t("wiki.icon.change") : t("wiki.icon.add")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  className={cn(
                    "grid size-12 shrink-0 place-items-center rounded-lg text-4xl leading-none transition-colors hover:bg-muted",
                    !value && "border border-dashed text-muted-foreground/60 hover:text-muted-foreground",
                  )}
                />
              }
            />
          }
        >
          {value ?? <SmilePlusIcon className="size-5" />}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="grid w-fit gap-1 p-0">
        <EmojiPicker onSelect={(e) => !pending && pick(e)} />
        {value && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => pick(null)} className="m-1.5 mt-0 justify-self-start">
            {t("wiki.icon.remove")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
