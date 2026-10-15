import { BotIcon } from "lucide-react"
import { FormCard } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { disconnectApp } from "./connections-actions"

type Ctx = Awaited<ReturnType<typeof getContext>>

// AI connections (Claude via MCP, see src/mcp/oauth.ts). "mine": the person's own, across orgs (Profile).
// "org": everyone's in the active org, for org.integrations.manage (Settings → API). Removing a row cuts it off at once.
export async function Connections({ ctx, scope, back }: { ctx: Ctx; scope: "mine" | "org"; back: string }) {
  const t = await getT()
  const db = scope === "mine" ? await createClient() : ctx.supabase
  let q = db.from("mcp_connections").select("id, client_name, access, last_used_at, created_at, user_id, orgs(name)").order("created_at", { ascending: false }).limit(200)
  q = scope === "mine" ? q.eq("user_id", ctx.userId) : q.eq("org_id", ctx.org.id)
  const { data: rows } = await q
  const ids = [...new Set((rows ?? []).map((r) => r.user_id))]
  const { data: people } = scope === "org" && ids.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] }
  const who = (id: string) => people?.find((p) => p.id === id)?.full_name || people?.find((p) => p.id === id)?.email || ""
  return (
    <FormCard id="connections" title={scope === "mine" ? t("settings.myConnections") : t("settings.connections")} description={scope === "mine" ? t("settings.myConnectionsHint") : t("settings.connectionsHint")}>
      {rows?.length ? (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <BotIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{r.client_name || "App"}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[scope === "mine" ? r.orgs?.name : who(r.user_id), r.last_used_at ? t("settings.lastUsed", { date: t.date(r.last_used_at, { dateStyle: "medium", timeStyle: "short" }) }) : t("settings.neverUsed")].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Badge variant="outline">{r.access === "read" ? t("oauth.accessRead") : t("oauth.accessMe")}</Badge>
              <form action={disconnectApp}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                  {t("settings.disconnect")}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("settings.noConnections")}</p>
      )}
    </FormCard>
  )
}
