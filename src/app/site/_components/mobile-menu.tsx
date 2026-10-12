"use client"

import { useEffect, useRef, useState } from "react"
import { MenuIcon, XIcon } from "lucide-react"

/** Burger menu for phones/tablets (below md): full-width panel under the nav with every link. */
export function MobileMenu({ label, close, groups }: { label: string; close: string; groups: { href: string; label: string }[][] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const click = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener("keydown", key)
    document.addEventListener("pointerdown", click)
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", key)
      document.removeEventListener("pointerdown", click)
      document.documentElement.style.overflow = ""
    }
  }, [open])

  return (
    <div ref={root} className="md:hidden">
      <button type="button" aria-expanded={open} aria-label={open ? close : label} onClick={() => setOpen(!open)} className="grid size-10 place-items-center">
        {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>
      <div
        data-open={open || undefined}
        className="pointer-events-none absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[calc(100dvh-100px)] translate-y-[-6px] overflow-y-auto border border-[var(--line)] bg-[var(--paper)] px-5 pb-4 opacity-0 shadow-[0_24px_60px_-24px_rgb(25_24_19/.35)] transition-[opacity,transform] data-open:translate-y-0 duration-300 data-open:pointer-events-auto data-open:opacity-100"
      >
        {groups.map((links, i) => (
          <ul key={i} className={`grid py-3 ${i ? "rule" : ""}`}>
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block py-2 text-[18px]">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
