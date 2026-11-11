"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const DAY = 86_400_000
const iso = (n: number) => new Date(n).toISOString().slice(0, 10)
type Mode = "move" | "start" | "end"

/**
 * One timeline bar. With `onMove`: drag the bar to shift it, its edges to change start / end (snaps to days, the
 * row's width / `days` = one day). A click without dragging opens the item. Dates that were empty stay empty when
 * the bar is only moved.
 */
export function TimelineBar({
  id,
  href,
  label,
  title,
  from,
  to,
  first,
  days,
  hasStart,
  hasEnd,
  color,
  done,
  onMove,
}: {
  id: string
  href: string
  label: string
  title: string
  from: number
  to: number
  first: number
  days: number
  hasStart: boolean
  hasEnd: boolean
  color: string
  done?: boolean
  onMove?: (id: string, start: string | null, end: string | null) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [shift, setShift] = useState({ a: 0, b: 0 }) // days added to start / end while dragging (and until saved)
  const [pending, start] = useTransition()
  const drag = useRef<{ mode: Mode; x: number; dayPx: number; moved: boolean } | null>(null)
  const a = from + shift.a * DAY
  const b = Math.max(a, to + shift.b * DAY)

  // The edges carry data-edge="start" | "end"; anywhere else on the bar moves it.
  const down = (e: React.PointerEvent) => {
    if (!onMove || e.button !== 0) return
    const mode = ((e.target as HTMLElement).dataset.edge as Mode | undefined) ?? "move"
    const row = (e.currentTarget as HTMLElement).closest("[data-row]") as HTMLElement
    drag.current = { mode, x: e.clientX, dayPx: row.getBoundingClientRect().width / days, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true
    const n = Math.round((e.clientX - d.x) / d.dayPx)
    const span = Math.round((to - from) / DAY)
    setShift(d.mode === "move" ? { a: n, b: n } : d.mode === "start" ? { a: Math.min(n, span), b: 0 } : { a: 0, b: Math.max(n, -span) })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved || !onMove) return
    if (!shift.a && !shift.b) return
    // Moving keeps an empty date empty; pulling an edge sets both (the bar then really has a range).
    const s = d.mode === "move" && !hasStart ? null : iso(a)
    const en = d.mode === "move" && !hasEnd ? null : iso(b)
    start(async () => {
      const r = await onMove(id, s, en)
      if (r.error) {
        toast.error(r.error)
        setShift({ a: 0, b: 0 })
      } else {
        router.refresh()
        setShift({ a: 0, b: 0 })
      }
    })
  }

  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      draggable={false}
      onClick={(e) => {
        if (drag.current?.moved || shift.a || shift.b) e.preventDefault()
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => ((drag.current = null), setShift({ a: 0, b: 0 }))}
      className={cn(
        "group/bar absolute top-1.5 flex h-7 min-w-7 touch-pan-y items-center overflow-hidden rounded-md border-l-4 px-2 text-xs font-medium whitespace-nowrap text-foreground select-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        onMove && "cursor-grab active:cursor-grabbing",
        done && "opacity-50",
        pending && "animate-pulse",
      )}
      style={{ left: `${((a - first) / DAY / days) * 100}%`, width: `calc(${((b - a) / DAY + 1) / days} * 100%)`, borderColor: color, background: `color-mix(in oklch, ${color} 22%, var(--background))` }}
    >
      {onMove && <span data-edge="start" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-foreground/10" aria-hidden />}
      <span className="truncate">{done ? `✓ ${label}` : label}</span>
      {onMove && <span data-edge="end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-foreground/10" aria-hidden />}
    </Link>
  )
}

const DRAG_TYPE = "application/x-roots-item"

/** An item without dates; with `draggable` it can be dropped onto the timeline (`<TimelineDrop>`). */
export function UndatedChip({ id, href, title, color, draggable }: { id: string; href: string; title: string; color: string; draggable: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, id)
        e.dataTransfer.effectAllowed = "move"
      }}
      className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-muted", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {title}
    </Link>
  )
}

/** The timeline's chart: undated items dropped on it get the day under the pointer as their end (due) date. */
export function TimelineDrop({ first, days, onMove, style, children }: { first: number; days: number; onMove?: (id: string, start: string | null, end: string | null) => Promise<{ error?: string }>; style: React.CSSProperties; children: React.ReactNode }) {
  const router = useRouter()
  const [over, setOver] = useState<number | null>(null) // day index under the pointer while dragging
  const [pending, start] = useTransition()
  const dayAt = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(days - 1, Math.floor(((e.clientX - r.left) / r.width) * days)))
  }
  return (
    <div
      className={cn("relative", pending && "opacity-70")}
      style={style}
      onDragOver={(e) => {
        if (!onMove || !e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        setOver(dayAt(e))
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(DRAG_TYPE)
        setOver(null)
        if (!onMove || !id) return
        e.preventDefault()
        const day = iso(first + dayAt(e) * DAY)
        start(async () => {
          const r = await onMove(id, null, day)
          if (r.error) toast.error(r.error)
          else router.refresh()
        })
      }}
    >
      {children}
      {over !== null && <span className="pointer-events-none absolute inset-y-0 bg-primary/15" style={{ left: `${(over / days) * 100}%`, width: `${100 / days}%` }} aria-hidden />}
    </div>
  )
}
