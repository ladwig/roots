"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Icon button that copies `value` (e.g. a share link) and confirms with a check for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              navigator.clipboard.writeText(value).then(() => {
                setDone(true)
                setTimeout(() => setDone(false), 1500)
              })
            }}
          />
        }
      >
        {done ? <CheckIcon /> : <CopyIcon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
