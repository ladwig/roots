import { CheckCircle2Icon, ExternalLinkIcon, GlobeIcon, Loader2Icon } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { domainsReady, orgDomain } from "@/domains/server"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { checkNowAction, connectDomainAction, removeDomainAction } from "./actions"
import { DomainPoller } from "./poller"

// Own domain for the public pages: enter it, copy the DNS records to the domain provider, we check until it's live.
export default async function DomainSettings({ searchParams }: PageProps<"/website/domain">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const d = await orgDomain(ctx.org.id)
  const rootsUrl = siteUrl(ctx.org.slug)
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader area="website" title={t("website.domain.nav")} description={t("domains.intro", { url: rootsUrl })} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {!d && !domainsReady() && <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("domains.notConfigured")}</p>}

      {!d && domainsReady() && (
        <FormCard id="connect" title={t("domains.connectTitle")} description={t("domains.connectHint")}>
          <form action={connectDomainAction} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="domain">{t("domains.domain")}</Label>
              <Input id="domain" name="domain" required placeholder="tickets.euerverein.de" autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url" className="max-w-sm font-mono" />
            </div>
            <SubmitButton className="justify-self-start">
              <GlobeIcon /> {t("domains.connect")}
            </SubmitButton>
          </form>
        </FormCard>
      )}

      {d && (
        <FormCard id="status" title={d.domain}>
          <div className="flex flex-wrap items-center gap-3">
            {d.status === "active" ? (
              <Badge>
                <CheckCircle2Icon /> {t("domains.active")}
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Loader2Icon className="animate-spin" /> {t("domains.pending")}
              </Badge>
            )}
            {d.checked_at && <span className="text-xs text-muted-foreground">{t("domains.checkedAt", { when: t.date(d.checked_at, { timeStyle: "short", dateStyle: "short" }) })}</span>}
          </div>
          {d.status === "active" ? (
            <div className="grid gap-3">
              <p className="text-sm">{t("domains.liveText", { domain: d.domain })}</p>
              <Button variant="outline" size="sm" className="justify-self-start" render={<a href={`https://${d.domain}`} target="_blank" rel="noreferrer" />} nativeButton={false}>
                <ExternalLinkIcon /> {t("domains.open")}
              </Button>
            </div>
          ) : (
            <>
              {d.problem && <p className="text-sm text-muted-foreground">{t.dynamic(`domains.problems.${d.problem}`)}</p>}
              <form action={checkNowAction}>
                <SubmitButton size="sm" variant="outline">
                  {t("domains.checkNow")}
                </SubmitButton>
              </form>
              <DomainPoller />
            </>
          )}
        </FormCard>
      )}

      {d && d.status === "pending" && (
        <FormCard id="dns" title={t("domains.stepsTitle")}>
          <ol className="grid gap-6">
            <Step n={1} title={t("domains.step1")}>
              <p>{t("domains.step1Text")}</p>
            </Step>
            <Step n={2} title={t("domains.step2")}>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("domains.type")}</th>
                      <th className="px-3 py-2 font-medium">{t("domains.name")}</th>
                      <th className="px-3 py-2 font-medium">{t("domains.value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.records.map((r) => (
                      <tr key={`${r.type}-${r.name}`} className="border-t align-middle">
                        <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 font-mono text-xs">
                            {r.name} <CopyButton value={r.name} label={t("domains.copy")} />
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 font-mono text-xs break-all">
                            {r.value} <CopyButton value={r.value} label={t("domains.copy")} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
                {d.records[0]?.name === "@" && <li>{t("domains.tipApex")}</li>}
                <li>{t("domains.tipFullName", { domain: d.domain })}</li>
                <li>{t("domains.tipReplace")}</li>
                <li>{t("domains.tipCloudflare")}</li>
                {d.records.some((r) => r.type === "TXT") && <li>{t("domains.tipTxt")}</li>}
              </ul>
            </Step>
            <Step n={3} title={t("domains.step3")}>
              <p>{t("domains.step3Text")}</p>
            </Step>
          </ol>
        </FormCard>
      )}

      {d && (
        <form action={removeDomainAction}>
          <SubmitButton variant="ghost" size="sm" className="text-destructive" data-confirm="domains.confirmRemove">
            {t("domains.remove")}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <p className="self-center font-medium">{title}</p>
      <div className="col-start-2 grid gap-3">{children}</div>
    </li>
  )
}

export const instant = false
