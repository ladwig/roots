import Link from "next/link"
import { Notice } from "@/components/notice"
import { UrlDialog } from "@/components/url-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { getIntegration } from "@/integrations/registry"
import { getModule, missingModules, modules } from "@/modules/registry"
import { disableModule, enableModule } from "./actions"

export default async function ModulesSettings({ searchParams }: PageProps<"/settings/modules">) {
  const ctx = await getContext()
  const sp = await searchParams
  const canManage = ctx.can("org.modules.manage")
  const confirming = getModule(param(sp, "enable") ?? "")
  const missing = confirming ? missingModules(confirming.key, ctx.modules) : []

  return (
    <div className="grid gap-4">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const on = ctx.modules.has(m.key)
          const needs = [
            ...(m.requires?.modules ?? []).map((k) => getModule(k)?.name ?? k),
            ...(m.requires?.integrations ?? []).map((k) => `${getIntegration(k)?.name ?? k[0].toUpperCase() + k.slice(1)} connection`),
          ]
          return (
            <li key={m.key} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                </div>
                {on && <Badge>On</Badge>}
              </div>
              {needs.length > 0 && <p className="text-xs text-muted-foreground">Needs {needs.join(", ")}</p>}
              {canManage && (
                <form action={on ? disableModule.bind(null, m.key) : enableModule.bind(null, m.key, false)} className="mt-auto">
                  <Button type="submit" variant={on ? "outline" : "default"} size="sm">
                    {on ? "Turn off" : "Turn on"}
                  </Button>
                </form>
              )}
            </li>
          )
        })}
      </ul>

      {canManage && confirming && missing.length > 0 && (
        <UrlDialog
          params={["enable"]}
          title={`Turn on ${confirming.name}?`}
          description={`${confirming.name} needs ${missing.map((k) => getModule(k)?.name).join(" and ")}. They will be turned on too.`}
        >
          <form action={enableModule.bind(null, confirming.key, true)} className="flex gap-2">
            <Button type="submit">Turn on all</Button>
            <Button render={<Link href="/settings/modules" scroll={false} />} nativeButton={false} variant="outline">
              Cancel
            </Button>
          </form>
        </UrlDialog>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
