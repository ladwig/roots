"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type P = { x: number; y: number; z: number; leaf: 0 | 1 | 2 | 3 } // 0 stem, 1 left leaf, 2 right leaf, 3 soil

const STEM = { bottom: -0.62, height: 0.72 } // the leaves sit on the stem's top (y 0.1)
const GROW = 2200 // ms: stem out of the soil, then the leaves pop open
const SHRINK = 900 // ms: back into the soil before growing again
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2) // a little overshoot: the "pop"

// The sprout as dots in 3D (unit space, y up): a curved stem, two leaves (filled with dots along their outline and
// midrib), a ring of soil. Built once; animated by swinging (never edge-on) and bending.
function shape(): P[] {
  const pts: P[] = []
  // stem: slightly curved, from the soil up to where the leaves start
  for (let i = 0; i <= 16; i++) {
    const u = i / 16
    pts.push({ x: Math.sin(u * 1.2) * 0.05, y: -0.62 + u * 0.72, z: 0, leaf: 0 })
  }
  // two leaves opening to the sides in a V, filled with dots (rows along the midrib)
  for (const side of [1, 2] as const) {
    const dir = side === 1 ? -1 : 1
    for (let i = 1; i <= 16; i++) {
      const u = i / 16
      const width = Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.24
      const mid = { x: dir * u * 0.7, y: 0.1 + u * 0.42 - u * u * 0.22 }
      for (const v of [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]) {
        if (v !== 0 && width * Math.abs(v) < 0.02) continue
        // across the leaf: perpendicular-ish to the midrib, with a little cup (z)
        pts.push({ x: mid.x - v * width * 0.45 * dir, y: mid.y + v * width * 0.85, z: v * width * 0.55 + Math.abs(v) * 0.04, leaf: side })
      }
    }
  }
  // soil: two rings
  for (const [r, n] of [[0.42, 22], [0.26, 14]] as const)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      pts.push({ x: Math.cos(a) * r, y: -0.64, z: Math.sin(a) * r, leaf: 3 })
    }
  return pts
}

/**
 * Sprout, the assistant, as an animated dotted 3D sprout (canvas, no WebGL), in the style of the thinking orbs. Drawn
 * in the current text colour (light / dark follows the theme). `working` turns faster and lets the leaves flutter.
 * Grows out of the soil on load (and now and then again). `still` (small icons) and prefers-reduced-motion draw one
 * grown frame.
 */
export function SproutOrb({ size = 20, working = false, still: fixed = false, className, label }: { size?: number; working?: boolean; still?: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef({ working })
  useEffect(() => {
    state.current.working = working
  }, [working])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    const pts = shape()
    const still = fixed || window.matchMedia("(prefers-reduced-motion: reduce)").matches // icon sizes: one still frame
    const dot = size >= 40 ? 1.3 : 0.75
    let angle = 0
    let phase = 0.4
    let speed = 0.7
    let raf = 0
    let last = performance.now()
    // Growing: from the bare soil on load; now and then (calm, every 50–80 s) back into the soil and up again.
    let growFrom = still ? -GROW : last
    let shrinkFrom = 0
    let nextReplay = last + 50_000 + Math.random() * 30_000

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const busy = state.current.working
      speed += ((busy ? 2.6 : 0.7) - speed) * Math.min(dt * 3, 1) // ease between calm and busy
      phase += dt * speed
      angle = Math.sin(phase) * (busy ? 0.95 : 0.7) // swing, never edge-on (leaves stay visible)
      const color = getComputedStyle(canvas).color
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = color
      const sway = Math.sin(now / 900) * 0.08
      const flutter = busy ? Math.sin(now / 120) : Math.sin(now / 700) * 0.4
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      if (!still && !busy && !shrinkFrom && now > nextReplay) shrinkFrom = now
      if (shrinkFrom && now - shrinkFrom > SHRINK) {
        shrinkFrom = 0
        growFrom = now
        nextReplay = now + 50_000 + Math.random() * 30_000
      }
      const g = shrinkFrom ? 1 - clamp((now - shrinkFrom) / SHRINK) : clamp((now - growFrom) / GROW)
      const stemUp = easeOut(clamp(g / 0.55)) // the stem rises first …
      const leafOpen = g >= 1 ? 1 : easeBack(clamp((g - 0.45) / 0.55)) // … then the leaves unfold
      const top = STEM.bottom + STEM.height * stemUp
      const shown = pts.flatMap((p) => {
        if (p.leaf === 3) return [p]
        if (p.leaf === 0) return [{ ...p, y: STEM.bottom + (p.y - STEM.bottom) * stemUp, x: p.x * stemUp }]
        if (leafOpen <= 0.02) return []
        return [{ ...p, x: p.x * leafOpen, y: top + (p.y - 0.1) * leafOpen, z: p.z * leafOpen }]
      })
      const list = shown.map((p, i) => {
        // leaves lift and flutter, the stem bends with the sway (more towards the top)
        const lift = p.leaf ? flutter * 0.06 * (p.leaf === 1 ? 1 : -1) * Math.abs(p.x) * 3 : 0
        const bend = sway * Math.max(p.y + 0.75, 0)
        const x0 = p.x + bend
        const y0 = p.y + lift
        const x = x0 * cos + p.z * sin
        const z = -x0 * sin + p.z * cos
        const persp = 1.6 / (2.4 - z)
        const shimmer = busy ? 0.75 + 0.25 * Math.sin(now / 90 + i * 1.7) : 1
        return { sx: size / 2 + x * persp * size * 0.56, sy: size / 2 - (y0 - 0.02) * persp * size * 0.56, depth: z, a: (0.35 + 0.65 * ((z + 1) / 2)) * shimmer }
      })
      list.sort((a, b) => a.depth - b.depth)
      for (const p of list) {
        ctx.globalAlpha = Math.max(0.15, Math.min(1, p.a))
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, dot * (0.8 + 0.4 * ((p.depth + 1) / 2)), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [size, fixed])

  return <canvas ref={ref} role="img" aria-label={label ?? "Sprout"} className={cn("shrink-0", className)} style={{ width: size, height: size }} />
}
