"use client"

import { useEffect } from "react"

/** Tells an open Sprout panel to reload its setup (e.g. after a key was added on the profile page). */
export function SproutRefresh({ stamp }: { stamp: string }) {
  useEffect(() => {
    window.dispatchEvent(new Event("sprout:refresh"))
  }, [stamp])
  return null
}
