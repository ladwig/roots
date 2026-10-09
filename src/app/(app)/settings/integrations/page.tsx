import Link from "next/link"
import { Notice } from "@/components/notice"
import { UrlDialog } from "@/components/url-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { getIntegration, integrations } from "@/integrations/registry"
import { connectIntegration, disconnectIntegration } from "./actions"
import { NotificationsSection } from "../notifications/section"

export default async function IntegrationsSettings({ searchParams }: PageProps<"/settings/integrations">) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const sp = await searchParams
  const { data: rows } = await ctx.supabase
    .from("org_integrations")
    .select("provider, status, config, last_error, secret_id")
    .eq("org_id", ctx.org.id)
  const connected = new Map(rows?.map((r) => [r.provider, r]))
  const connecting = getIntegration(param(sp, "connect") ?? "")
  const notificationSheet = !!(param(sp, "edit") || param(sp, "new"))
  const current = connecting && connected.get(connecting.key)

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <h2 className="font-medium">{t("settings.tabs.integrations")}</h2>
        <Notice
          error={!connecting && !notificationSheet ? param(sp, "error") : undefined}
          ok={!notificationSheet ? param(sp, "ok") : undefined}
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {integrations.map((i) => {
            const row = connected.get(i.key)
            return (
              <li key={i.key} className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-sm text-muted-foreground">{t.dynamic(`integrations.${i.key}.description`)}</p>
                  </div>
                  {row && (
                    <Badge variant={row.status === "connected" ? "default" : row.status === "pending" ? "outline" : "destructive"}>
                      {t.dynamic(`integrations.status.${row.status}`)}
                    </Badge>
                  )}
                </div>
                {row?.last_error && <p className="text-xs text-destructive">{row.last_error}</p>}
                {i.key === "sumup" && row && (
                  <p className="text-xs text-muted-foreground">
                    {t("integrations.sumup.merchant", {
                      name: String((row.config as Record<string, unknown>)?.merchant_name ?? ""),
                      code: String((row.config as Record<string, unknown>)?.merchant_code ?? ""),
                    })}
                    {!(row.config as Record<string, unknown>)?.can_take_payments && (
                      <span className="block">{t("integrations.sumup.noPayments")}</span>
                    )}
                  </p>
                )}
                {i.key === "telegram" && row && (
                  <p className="text-xs text-muted-foreground">
                    {t("integrations.telegram.bot", {
                      name: String((row.config as Record<string, unknown>)?.bot_username ?? ""),
                    })}{" "}
                    ·{" "}
                    {t("integrations.telegram.chats", {
                      count: (((row.config as Record<string, unknown>)?.chats as unknown[]) ?? []).length,
                    })}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  {i.connect ? (
                    row?.status === "connected" ? null : row?.status === "pending" &&
                      (row.config as Record<string, string>)?.via === "onboarding" ? (
                      <Button render={<a href={`/api/integrations/${i.key}/connect?mode=new`} />} nativeButton={false} size="sm">
                        {t("integrations.continueSetup")}
                      </Button>
                    ) : (
                      (i.connect.modes ?? ["default"]).map((mode, n) => (
                        <Button
                          key={mode}
                          render={<a href={`/api/integrations/${i.key}/connect?mode=${mode}`} />}
                          nativeButton={false}
                          size="sm"
                          variant={n === 0 ? "default" : "outline"}
                        >
                          {t.has(`integrations.${i.key}.modes.${mode}`)
                            ? t.dynamic(`integrations.${i.key}.modes.${mode}`)
                            : t("integrations.connect")}
                        </Button>
                      ))
                    )
                  ) : (
                    <Button render={<Link href={`?connect=${i.key}`} scroll={false} />} nativeButton={false} size="sm">
                      {row ? t("integrations.edit") : t("integrations.connect")}
                    </Button>
                  )}
                  {row && (
                    <form action={disconnectIntegration.bind(null, i.key)}>
                      <Button type="submit" variant="outline" size="sm">
                        {t("integrations.disconnect")}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <NotificationsSection sp={sp} />

      {connecting?.fields && (
        <UrlDialog
          params={["connect"]}
          title={t("integrations.connectTitle", { name: connecting.name })}
          description={t.dynamic(`integrations.${connecting.key}.description`)}
        >
          <form action={connectIntegration.bind(null, connecting.key)} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            {connecting.fields.map((f) => {
              const help = `integrations.${connecting.key}.help.${f.key}`
              return (
                <div key={f.key} className="grid gap-2">
                  <Label htmlFor={`f-${f.key}`}>{t.dynamic(`integrations.${connecting.key}.fields.${f.key}`)}</Label>
                  <Input
                    id={`f-${f.key}`}
                    name={f.key}
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    placeholder={f.secret && current?.secret_id ? t("integrations.secretSaved") : f.placeholder}
                    defaultValue={f.secret ? undefined : String((current?.config as Record<string, unknown> | undefined)?.[f.key] ?? "")}
                    required={f.secret && !current?.secret_id}
                  />
                  {t.has(help) && <p className="text-xs text-muted-foreground">{t.dynamic(help)}</p>}
                </div>
              )
            })}
            <Button type="submit">{t("common.save")}</Button>
          </form>
        </UrlDialog>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
