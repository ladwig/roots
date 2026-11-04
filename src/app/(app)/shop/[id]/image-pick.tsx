"use client"

import { useRef, useState } from "react"
import { ImageIcon, XIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// A variant's picture: thumbnail button → the product's pictures to pick from (posts the path as `name`).
export function ImagePick({ name, images, defaultValue, disabled, label, noneLabel }: { name: string; images: { path: string; url: string }[]; defaultValue: string; disabled?: boolean; label: string; noneLabel: string }) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const current = images.find((i) => i.path === value)
  const pick = (path: string) => {
    setValue(path)
    setOpen(false)
    // The save bar listens for input events; a hidden input changes without one.
    requestAnimationFrame(() => input.current?.dispatchEvent(new Event("input", { bubbles: true })))
  }
  const thumb = "size-12 overflow-hidden rounded-md border-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
  return (
    <>
      <input ref={input} type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" />} disabled={disabled} aria-label={label} className="grid size-9 place-items-center overflow-hidden rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-60">
          {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
          {current ? <img src={current.url} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4" />}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={() => pick("")} aria-label={noneLabel} aria-pressed={!value} className={cn(thumb, "grid place-items-center text-muted-foreground", !value ? "border-primary" : "border-transparent bg-muted")}>
              <XIcon className="size-4" />
            </button>
            {images.map((i, n) => (
              <button key={i.path} type="button" onClick={() => pick(i.path)} aria-label={`${n + 1} / ${images.length}`} aria-pressed={value === i.path} className={cn(thumb, value === i.path ? "border-primary" : "border-transparent")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
                <img src={i.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
