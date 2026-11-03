"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// Product pictures like other shops: one big picture, thumbnails below to switch.
export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0)
  return (
    <div className="grid gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
      <img src={images[i]} alt={alt} className="aspect-square w-full rounded-xl border object-cover" />
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((src, n) => (
            <button
              key={src}
              type="button"
              onClick={() => setI(n)}
              aria-label={`${n + 1} / ${images.length}`}
              aria-current={n === i}
              className={cn("overflow-hidden rounded-lg border-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", n === i ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
              <img src={src} alt="" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
