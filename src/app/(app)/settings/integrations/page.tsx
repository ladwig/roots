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
import { checkStripe, connectIntegration, disconnectIntegration, savePaymentCosts } from "./actions"
import { DEFAULT_COSTS } from "@/payments/fees"
import { TypedInput } from "@/components/typed-input"
import { formatMoney } from "@/lib/inputs"
import { NotificationsSection } from "../notifications/section"
import { SubmitButton } from "@/components/submit-button"

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
                    {t.dynamic(`integrations.sumup.via.${String((row.config as Record<string, unknown>)?.via ?? "oauth")}`)} ·{" "}
                    {t("integrations.sumup.merchant", {
                      name: String((row.config as Record<string, unknown>)?.merchant_name ?? ""),
                      code: String((row.config as Record<string, unknown>)?.merchant_code ?? ""),
                    })}
                    {!(row.config as Record<string, unknown>)?.can_take_payments && (
                      <span className="block">{t("integrations.sumup.noPayments")}</span>
                    )}
                  </p>
                )}
                {i.key === "stripe" && row && (
                  <p className="text-xs text-muted-foreground">
                    {t.dynamic(`integrations.stripe.via.${String((row.config as Record<string, unknown>)?.via ?? "oauth")}`)}
                    {(row.config as Record<string, unknown>)?.accountId
                      ? ` · ${String((row.config as Record<string, unknown>).accountId)}`
                      : ""}
                    {(row.config as Record<string, unknown>)?.via === "key" &&
                      (row.config as Record<string, unknown>)?.livemode === false &&
                      ` · ${t("integrations.stripe.testMode")}`}
                  </p>
                )}
                {(i.key === "stripe" || i.key === "sumup") && row?.status === "connected" && (
                  // Payment costs → buyers: a service fee on every paid order (not a card surcharge, see src/payments/fees.ts).
                  <details className="rounded-lg border p-3 text-sm" open={!!(row.config as Record<string, unknown>)?.pass_fees}>
                    <summary className="cursor-pointer font-medium">{t("integrations.costs.title")}</summary>
                    <form action={savePaymentCosts.bind(null, i.key)} className="mt-3 grid gap-3">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="pass_fees" defaultChecked={!!(row.config as Record<string, unknown>)?.pass_fees} className="size-4 accent-primary" />
                        {t("integrations.costs.passOn")}
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="grid gap-1">
                          <Label htmlFor={`fp-${i.key}`}>{t("integrations.costs.percent")}</Label>
                          <Input
                            id={`fp-${i.key}`}
                            name="fee_percent"
                            inputMode="decimal"
                            className="w-24 tabular-nums"
                            defaultValue={String((row.config as Record<string, unknown>)?.fee_percent ?? DEFAULT_COSTS[i.key].percent).replace(".", ",")}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor={`ff-${i.key}`}>{t("integrations.costs.fixed")}</Label>
                          <TypedInput
                            kind="money"
                            id={`ff-${i.key}`}
                            name="fee_fixed"
                            className="w-28"
                            defaultValue={formatMoney(Number((row.config as Record<string, unknown>)?.fee_fixed_cents ?? DEFAULT_COSTS[i.key].fixedCents))}
                          />
                        </div>
                        <SubmitButton size="sm" variant="outline">
                          {t("common.save")}
                        </SubmitButton>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.dynamic(`integrations.costs.hint.${i.key}`)}</p>
                    </form>
                  </details>
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
                    // Linked: no connect buttons, only what fits the state (finish setup / check / disconnect).
                    row?.status === "connected" ? null : row?.status === "pending" ? (
                      <>
                        <Button
                          render={
                            (row.config as Record<string, string>)?.via === "onboarding" ? (
                              <a href={`/api/integrations/${i.key}/connect?mode=new`} />
                            ) : (
                              // OAuth-linked account: activation happens in the org's own Stripe Dashboard.
                              <a href="https://dashboard.stripe.com/account/onboarding" target="_blank" rel="noreferrer" />
                            )
                          }
                          nativeButton={false}
                          size="sm"
                        >
                          {t("integrations.continueSetup")}
                        </Button>
                        {i.key === "stripe" && (
                          <form action={checkStripe}>
                            <SubmitButton variant="outline" size="sm">
                              {t("integrations.checkStatus")}
                            </SubmitButton>
                          </form>
                        )}
                      </>
                    ) : (
                      <>
                        {(i.connect.modes ?? ["default"]).map((mode, n) => (
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
                        ))}
                        {i.fields && (
                          <Button
                            render={<Link href={`?connect=${i.key}`} scroll={false} />}
                            nativeButton={false}
                            size="sm"
                            variant="outline"
                          >
                            {t.dynamic(`integrations.${i.key}.keyButton`)}
                          </Button>
                        )}
                      </>
                    )
                  ) : (
                    <Button render={<Link href={`?connect=${i.key}`} scroll={false} />} nativeButton={false} size="sm">
                      {row ? t("integrations.edit") : t("integrations.connect")}
                    </Button>
                  )}
                  {row && (
                    <form action={disconnectIntegration.bind(null, i.key)}>
                      <SubmitButton variant="outline" size="sm">
                        {t("integrations.disconnect")}
                      </SubmitButton>
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
            {t.has(`integrations.${connecting.key}.setup`) && (
              // One step per line in integrations.<key>.setup: what to do at the provider before pasting anything here.
              <details open={!current} className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">{t("integrations.setupTitle", { name: connecting.name })}</summary>
                <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-muted-foreground">
                  {t.dynamic(`integrations.${connecting.key}.setup`).split("\n").map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            )}
            {connecting.fields.map((f) => {
              const help = `integrations.${connecting.key}.help.${f.key}`
              return (
                <div key={f.key} className="grid gap-2">
                  <Label htmlFor={`f-${f.key}`}>{t.dynamic(`integrations.${connecting.key}.fields.${f.key}`)}</Label>
                  <Input
                    id={`f-${f.key}`}
                    name={f.key}
                    // Not type="password": browsers would offer (and autofill) the login password into API key fields.
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder={f.secret && current?.secret_id ? t("integrations.secretSaved") : f.placeholder}
                    defaultValue={f.secret ? undefined : String((current?.config as Record<string, unknown> | undefined)?.[f.key] ?? "")}
                    required={f.secret && !current?.secret_id}
                  />
                  {t.has(help) && <p className="text-xs whitespace-pre-line text-muted-foreground">{t.dynamic(help)}</p>}
                </div>
              )
            })}
            <SubmitButton>{t("common.save")}</SubmitButton>
          </form>
        </UrlDialog>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
