"use client"

import { useEffect } from "react"

/** Sets `data-scrolled` on <html> once the page is scrolled a little; CSS transitions the nav + hero frame from it. */
export function ScrollFlag() {
  useEffect(() => {
    const root = document.documentElement
    const update = () => root.toggleAttribute("data-scrolled", window.scrollY > 24)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      window.removeEventListener("scroll", update)
      root.removeAttribute("data-scrolled")
    }
  }, [])
  return null
}
