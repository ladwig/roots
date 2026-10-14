"use client"

import { useEffect } from "react"

// Page keys outside text fields: N = the page's main "new" button (PageHeader `primary`), / = the list search.
export function Shortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = e.target as HTMLElement
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return
      if (e.key === "n") document.querySelector<HTMLElement>('[data-shortcut="new"]')?.click()
      else if (e.key === "/") {
        const box = document.querySelector<HTMLInputElement>('[data-shortcut="search"]')
        if (!box) return
        e.preventDefault()
        box.focus()
      } else return
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return null
}
