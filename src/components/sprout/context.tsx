"use client"

import { createContext, useContext, useState } from "react"
import { SproutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

// Open / wide state of the Sprout panel, shared by the top-bar button and the panel. Remembered in a cookie so the
// panel stays open across pages and reloads (the App layout reads it, no flash).
type State = { open: boolean; wide: boolean; setOpen: (v: boolean) => void; setWide: (v: boolean) => void }
const Ctx = createContext<State>({ open: false, wide: false, setOpen: () => {}, setWide: () => {} })
export const useSprout = () => useContext(Ctx)

const remember = (open: boolean, wide: boolean) => {
  document.cookie = `sprout=${open ? (wide ? "wide" : "open") : "closed"}; path=/; max-age=31536000; samesite=lax`
}

export function SproutProvider({ initial, children }: { initial: string | undefined; children: React.ReactNode }) {
  const [open, setOpenState] = useState(initial === "open" || initial === "wide")
  const [wide, setWideState] = useState(initial === "wide")
  const setOpen = (v: boolean) => (setOpenState(v), remember(v, wide))
  const setWide = (v: boolean) => (setWideState(v), remember(open, v))
  return <Ctx.Provider value={{ open, wide, setOpen, setWide }}>{children}</Ctx.Provider>
}

export function SproutButton() {
  const t = useT()
  const { open, setOpen } = useSprout()
  return (
    <Button variant={open ? "secondary" : "outline"} size="sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="sprout-panel" className="ml-auto">
      <SproutIcon /> <span className="max-sm:sr-only">{t("sprout.name")}</span>
    </Button>
  )
}
