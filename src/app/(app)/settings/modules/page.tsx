import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { getModule, modules } from "@/modules/registry"

// Read-only: platform admins switch modules on per org (/admin/orgs → drawer).
export default async function ModulesSettings() {
  const ctx = await getContext()
  const t = await getT()
  const name = (k: string) => t.dynamic(`modules.${k}.name`)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("modules.managedByPlatform")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const on = ctx.modules.has(m.key)
          const needs = (m.requires?.modules ?? []).map((k) => name(getModule(k)?.key ?? k))
          return (
            <li key={m.key} className="flex flex-col gap-2 rounded-lg border p-4 data-[off=true]:opacity-60" data-off={!on}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{name(m.key)}</p>
                  <p className="text-sm text-muted-foreground">{t.dynamic(`modules.${m.key}.description`)}</p>
                </div>
                {on && <Badge>{t("modules.on")}</Badge>}
              </div>
              {needs.length > 0 && <p className="text-xs text-muted-foreground">{t("modules.needs", { list: t.list(needs) })}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
