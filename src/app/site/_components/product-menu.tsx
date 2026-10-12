"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ContactIcon,
  FileTextIcon,
  IdCardIcon,
  MailIcon,
  TicketIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  members: IdCardIcon,
  tickets: TicketIcon,
  events: CalendarDaysIcon,
  shifts: CalendarClockIcon,
  invoices: FileTextIcon,
  forms: MailIcon,
  contacts: ContactIcon,
  portal: UserRoundIcon,
}

export type MenuItem = { key: string; href: string; title: string; text: string }

/**
 * "Produkt" in the nav: opens a panel with every area (icon, name, one line), a painting card and links.
 * Opens on hover (desktop) or click/tap, closes on Escape, outside click or leaving it.
 */
export function ProductMenu({
  label,
  intro,
  items,
  card,
  links,
}: {
  label: string
  intro: string
  items: MenuItem[]
  card: { src: string; alt: string; title: string; link: string; href: string }
  links: { href: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hover = (v: boolean) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(v), v ? 60 : 180)
  }

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const click = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener("keydown", key)
    document.addEventListener("mousedown", click)
    return () => {
      document.removeEventListener("keydown", key)
      document.removeEventListener("mousedown", click)
    }
  }, [open])

  return (
    <div ref={root} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} className="soft flex items-center gap-1 transition-colors hover:text-[var(--ink)] aria-expanded:text-[var(--ink)]">
        {label}
        <ChevronDownIcon className={`size-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Panel: under the nav bar, as wide as the content; fades + slides in */}
      <div
        data-open={open || undefined}
        className="pointer-events-none fixed inset-x-[var(--gutter)] top-[84px] z-50 mx-auto max-w-[1120px] translate-y-[-8px] opacity-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(.2,.7,.1,1)] data-open:pointer-events-auto data-open:translate-y-0 data-open:opacity-100"
      >
        <div className="grid gap-8 border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_24px_60px_-24px_rgb(25_24_19/.35)] md:grid-cols-[1fr_320px] md:p-8">
          <div>
            <p className="soft mb-6 text-[14px]">{intro}</p>
            <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {items.map((item, i) => {
                const Icon = ICONS[item.key] ?? FileTextIcon
                return (
                  <li key={item.key} style={{ transitionDelay: open ? `${60 + i * 25}ms` : "0ms" }} className={`transition-[opacity,transform] duration-300 ${open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
                    <a href={item.href} onClick={() => setOpen(false)} className="group flex gap-3">
                      <Icon className="mt-0.5 size-5 shrink-0 text-[var(--olive)]" strokeWidth={1.5} />
                      <span className="grid">
                        <span className="text-[16px] group-hover:underline group-hover:decoration-[var(--line)] group-hover:underline-offset-4">{item.title}</span>
                        <span className="soft text-[14px]">{item.text}</span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
          <a href={card.href} onClick={() => setOpen(false)} className="group hidden overflow-hidden border border-[var(--line)] bg-[var(--paper-2)] md:grid md:grid-rows-[180px_auto]">
            <span className="painting relative block rounded-none">
              <Image src={card.src} alt={card.alt} fill sizes="320px" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" style={{ objectPosition: "50% 40%" }} />
            </span>
            <span className="grid content-start gap-3 p-5">
              <span className="text-[18px] leading-snug">{card.title}</span>
              <span className="soft flex items-center justify-between text-[14px]">
                {card.link} <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </span>
          </a>
          <div className="rule flex flex-wrap gap-x-10 gap-y-3 pt-5 text-[14px] md:col-span-2">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="group flex items-center gap-2">
                {l.label} <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
