"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const PAGE_PX = 794 // 210 mm at 96 dpi

/**
 * Shows a paper document (e.g. <DocumentPage>) scaled to the available width. Rendered into a sandboxed iframe
 * (no scripts), so org-written HTML inside it can't touch the app; React fills it through a portal.
 */
export function PaperPreview({ title, children }: { title: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [scale, setScale] = useState(0.5)
  const [height, setHeight] = useState(1123)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / PAGE_PX)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Grow with the content (multi-page letters).
  useLayoutEffect(() => {
    if (!body) return
    const ro = new ResizeObserver(() => setHeight(Math.max(1123, body.scrollHeight)))
    ro.observe(body)
    return () => ro.disconnect()
  }, [body])

  return (
    <div ref={box} className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ height: height * scale }}>
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-same-origin"
        srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body style='margin:0;background:#fff'></body></html>"
        onLoad={() => setBody(frame.current?.contentDocument?.body ?? null)}
        style={{ width: PAGE_PX, height, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", display: "block" }}
      />
      {body && createPortal(children, body)}
    </div>
  )
}
