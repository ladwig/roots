"use client"

import { useSyncExternalStore } from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

// Light / dark / system, per browser (localStorage "theme"). THEME_SCRIPT applies it before first paint.
type Theme = "light" | "dark" | "system"
const read = (): Theme => {
  try {
    const v = localStorage.getItem("theme")
    return v === "light" || v === "dark" ? v : "system"
  } catch {
    return "system"
  }
}
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}
// Inline in <head>: no flash of the wrong theme. Also follows the OS while on "system".
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("theme")}catch(e){}var m=matchMedia("(prefers-color-scheme: dark)");function a(){var d=t==="dark"||(t!=="light"&&m.matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}a();m.addEventListener("change",function(){try{t=localStorage.getItem("theme")}catch(e){}a()})})()`

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))

export function ThemeSwitch() {
  const t = useT()
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme)
  const set = (v: Theme) => {
    try {
      if (v === "system") localStorage.removeItem("theme")
      else localStorage.setItem("theme", v)
    } catch {}
    applyTheme(v)
    listeners.forEach((l) => l())
  }
  const options: [Theme, React.ReactNode][] = [
    ["light", <SunIcon key="l" />],
    ["dark", <MoonIcon key="d" />],
    ["system", <MonitorIcon key="s" />],
  ]
  return (
    <div role="radiogroup" aria-label={t("account.theme")} className="inline-flex w-fit gap-1 rounded-lg border p-1">
      {options.map(([v, icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          onClick={() => set(v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4",
            theme === v && "bg-muted text-foreground",
          )}
        >
          {icon}
          {t.dynamic(`account.themes.${v}`)}
        </button>
      ))}
    </div>
  )
}
