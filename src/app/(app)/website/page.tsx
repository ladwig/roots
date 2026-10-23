import Link from "next/link"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { orgDomain } from "@/domains/server"
import { loadSite } from "@/site/server"
import { PublishBar } from "./publish-bar"

// Website › Übersicht: where the public pages are and what's still missing.
export default async function WebsiteOverview({ searchParams }: PageProps<"/website">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const [site, domain] = await Promise.all([loadSite(ctx.supabase, ctx.org.id), orgDomain(ctx.org.id)])
  const url = siteUrl(ctx.org.slug, "", ctx.org.site_domain)
  const s = site.live
  const checks = [
    { done: !!ctx.org.logo_path, label: t("website.check.logo"), href: "/settings/general" },
    { done: !!(s.theme.accent || s.theme.font_body || s.theme.background), label: t("website.check.brand"), href: "/website/brand" },
    { done: site.exists, label: t("website.check.start"), href: "/website/pages/start" },
    { done: !!s.imprint, label: t("website.check.imprint"), href: "/website/pages/legal" },
    { done: !!s.privacy, label: t("website.check.privacy"), href: "/website/pages/legal" },
    { done: domain?.status === "active", label: t("website.check.domain"), href: "/website/domain" },
  ]
  return (
    <>
      <PageHeader area="website" title={t("website.nav")} description={t("website.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={url} back="/website" />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCard title={t("website.address")}>
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-sm break-all underline-offset-4 hover:underline">
            {url}
          </a>
          {site.publishedAt && <p className="text-xs text-muted-foreground">{t("website.publishedAt", { when: t.date(site.publishedAt, { dateStyle: "medium", timeStyle: "short" }) })}</p>}
        </FormCard>
        <FormCard title={t("website.checklist")}>
          <ul className="grid gap-2 text-sm">
            {checks.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-2 hover:underline">
                  {c.done ? <CheckCircle2Icon className="size-4 text-primary" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                  <span className={c.done ? "text-muted-foreground" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FormCard>
      </div>
    </>
  )
}

export const instant = false
