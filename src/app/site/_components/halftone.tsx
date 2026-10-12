"use client"

import { useEffect, useRef } from "react"

/**
 * Renders an image as a halftone dot grid on a canvas (dot size = brightness), building up dot by dot when it
 * enters the screen. Sits on top of the real image; the page fades it out on scroll to reveal the painting.
 * Same-origin images only (reads pixels). Reduced motion: drawn at once.
 */
export function Halftone({ src, cell = 7, color = "244 239 230", background = "20 19 15", className }: { src: string; cell?: number; color?: string; background?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const img = new Image()
    img.src = src
    let raf = 0
    let start = 0
    let cells: { x: number; y: number; r: number; d: number }[] = []
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height || !img.complete) return
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const size = cell * dpr
      const cols = Math.ceil(canvas.width / size)
      const rows = Math.ceil(canvas.height / size)
      // Sample the image "object-fit: cover" into a cols × rows grid.
      const sample = document.createElement("canvas")
      sample.width = cols
      sample.height = rows
      const s = sample.getContext("2d", { willReadFrequently: true })!
      const scale = Math.max(cols / img.width, rows / img.height)
      const w = img.width * scale
      const h = img.height * scale
      s.drawImage(img, (cols - w) / 2, (rows - h) * 0.35, w, h)
      const data = s.getImageData(0, 0, cols, rows).data
      cells = []
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
          const r = (size / 2) * Math.pow(lum, 1.15) * 0.95
          // Build-up order: left to right with some noise, like a scan.
          const d = (x / cols) * 0.75 + ((x * 73 + y * 151) % 97) / 97 * 0.25
          if (r > 0.35 * dpr) cells.push({ x: (x + 0.5) * size, y: (y + 0.5) * size, r, d })
        }
      start = 0
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }

    const draw = (now: number) => {
      if (!start) start = now
      const t = still ? 2 : (now - start) / 1400
      ctx.fillStyle = `rgb(${background})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = `rgb(${color})`
      ctx.beginPath()
      for (const c of cells) {
        const k = Math.min(1, Math.max(0, (t - c.d) * 3))
        if (k <= 0) continue
        ctx.moveTo(c.x + c.r * k, c.y)
        ctx.arc(c.x, c.y, c.r * k, 0, Math.PI * 2)
      }
      ctx.fill()
      if (t < 1.4) raf = requestAnimationFrame(draw)
    }

    img.onload = layout
    const ro = new ResizeObserver(() => layout())
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [src, cell, color, background])

  return <canvas ref={ref} aria-hidden className={className} />
}

/**
 * Transparent canvas over a painting: every few seconds a soft patch of halftone dots (dot size = darkness of the
 * image underneath) drifts across a random path, glows up and fades out again. Same-origin images only.
 * `y` = vertical object-position of the image (0..1) so the dots line up. Reduced motion: nothing.
 */
export function HalftoneGlint({ src, cell = 8, y = 0.5, light = "255 248 230", ink = "25 24 19", className }: { src: string; cell?: number; y?: number; light?: string; ink?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const img = new Image()
    img.src = src
    let cells: { x: number; y: number; r: number; color: string }[] = []
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height || !img.complete) return
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const size = cell * dpr
      const cols = Math.ceil(canvas.width / size)
      const rows = Math.ceil(canvas.height / size)
      const sample = document.createElement("canvas")
      sample.width = cols
      sample.height = rows
      const s = sample.getContext("2d", { willReadFrequently: true })!
      const scale = Math.max(cols / img.width, rows / img.height)
      s.drawImage(img, (cols - img.width * scale) / 2, (rows - img.height * scale) * y, img.width * scale, img.height * scale)
      const data = s.getImageData(0, 0, cols, rows).data
      cells = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4
          const dark = 1 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
          // Light dots on dark paint, ink dots on bare paper, so the patch shows everywhere.
          const onPaper = dark < 0.25
          cells.push({ x: (c + 0.5) * size, y: (r + 0.5) * size, r: (size / 2) * (onPaper ? 0.35 : 0.3 + 0.65 * dark), color: onPaper ? ink : light })
        }
    }

    // One pass: a patch moves from a random point to another over ~2.8 s, fading in and out.
    const pass = () => {
      const w = canvas.width
      const h = canvas.height
      const from = { x: Math.random() * w, y: Math.random() * h }
      const to = { x: from.x + (Math.random() - 0.5) * w * 0.8, y: from.y + (Math.random() - 0.5) * h * 0.6 }
      const radius = Math.min(w, h) * (0.18 + Math.random() * 0.14)
      const length = 2800
      let start = 0
      const draw = (now: number) => {
        if (!start) start = now
        const p = Math.min(1, (now - start) / length)
        const ease = p * p * (3 - 2 * p)
        const cx = from.x + (to.x - from.x) * ease
        const cy = from.y + (to.y - from.y) * ease
        const envelope = Math.sin(Math.PI * p)
        ctx.clearRect(0, 0, w, h)
        for (const c of cells) {
          const d = Math.hypot(c.x - cx, c.y - cy) / radius
          if (d >= 1) continue
          // Soft edge plus a little flicker so the patch looks scanned, not stamped.
          const a = envelope * (1 - d * d) * (0.55 + 0.45 * Math.sin(c.x * 0.37 + c.y * 0.53 + now / 90)) * (c.color === ink ? 0.45 : 0.95)
          if (a <= 0.02) continue
          ctx.fillStyle = `rgb(${c.color} / ${a.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          ctx.fill()
        }
        if (p < 1) raf = requestAnimationFrame(draw)
        else {
          ctx.clearRect(0, 0, w, h)
          timer = setTimeout(pass, 3000 + Math.random() * 5000)
        }
      }
      raf = requestAnimationFrame(draw)
    }

    img.onload = () => {
      layout()
      timer = setTimeout(pass, 1200)
    }
    const ro = new ResizeObserver(() => layout())
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [src, cell, y, light, ink])

  return <canvas ref={ref} aria-hidden className={className} />
}
