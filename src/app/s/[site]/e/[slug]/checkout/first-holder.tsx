"use client"

import { useEffect } from "react"

// Types the buyer's name into ticket 1 until someone edits that field by hand.
export function FirstHolder() {
  useEffect(() => {
    const buyer = document.getElementById("buyer-name") as HTMLInputElement | null
    const holder = document.getElementById("holder-0") as HTMLInputElement | null
    if (!buyer || !holder) return
    let own = holder.value !== "" && holder.value !== buyer.value
    const copy = () => { if (!own) holder.value = buyer.value }
    const edit = () => { own = holder.value !== "" }
    buyer.addEventListener("input", copy)
    holder.addEventListener("input", edit)
    return () => { buyer.removeEventListener("input", copy); holder.removeEventListener("input", edit) }
  }, [])
  return null
}
