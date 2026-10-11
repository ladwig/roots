import { ExternalLinkIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { modules } from "@/modules/registry"
import { revokeApiKey } from "./actions"
import { NewKey } from "./new-key"

export default async function ApiSettings({ searchParams }: PageProps<"/settings/api">) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const sp = await searchParams
  const { data: keys } = await ctx.supabase
    .from("api_keys")
    .select("id, name, prefix, permissions, last_used_at, revoked_at, created_at")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
  const groups = modules
    .filter((m) => ctx.modules.has(m.key))
    .map((m) => ({
      module: m.key,
      label: t.dynamic(`modules.${m.key}.name`),
      perms: m.permissions.map((p) => ({ key: p, label: t.dynamic(`permissions.${p}`) })),
    }))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("api.intro")}</p>
        <a href="/api/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
          {t("api.docs")} <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {groups.length ? <NewKey groups={groups} /> : <p className="text-sm text-muted-foreground">{t("api.noModules")}</p>}
      <DataTable
        rows={keys ?? []}
        rowKey={(k) => k.id}
        empty={t("api.empty")}
        columns={[
          {
            header: t("api.name"),
            cell: (k) => (
              <span className="grid">
                <span className="font-medium">{k.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{k.prefix}…</span>
              </span>
            ),
          },
          { header: t("api.permissions"), cell: (k) => <span className="font-mono text-xs">{k.permissions.join(", ")}</span> },
          {
            header: t("api.lastUsed"),
            cell: (k) => (k.last_used_at ? t.date(k.last_used_at, { dateStyle: "short", timeStyle: "short" }) : t("api.never")),
          },
          {
            header: "",
            cell: (k) =>
              k.revoked_at ? (
                <Badge variant="secondary">{t("api.revokedBadge")}</Badge>
              ) : (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("api.revoke")}
                  </SubmitButton>
                </form>
              ),
          },
        ]}
      />
    </div>
  )
}

export const instant = false
