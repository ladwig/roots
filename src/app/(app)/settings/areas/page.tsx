import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { visibleNav } from "@/modules/nav"

// Each area keeps its own settings as its last sub-page ("Einstellungen"); this lists them all in one place.
export default async function AreaSettings() {
  const ctx = await getContext()
  const t = await getT()
  const areas = visibleNav((m) => ctx.modules.has(m), ctx.can).flatMap((a) => a.children.filter((c) => c.label === "common.settings").map((c) => ({ ...a, href: c.href })))
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.areasIntro")}</p>
      {areas.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {areas.map((a) => (
            <li key={a.href}>
              <Link href={a.href} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
                  <a.icon className="size-5" />
                </span>
                <span className="flex-1 font-medium">{t.dynamic(a.label)}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("settings.areasNone")}</p>
      )}
    </div>
  )
}

export const instant = false
