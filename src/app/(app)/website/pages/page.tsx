import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { loadSite } from "@/site/server"
import { PublishBar } from "../publish-bar"

// Website › Seiten: the org's public pages that can be designed.
export default async function PagesList({ searchParams }: PageProps<"/website/pages">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const site = await loadSite(ctx.supabase, ctx.org.id)
  const d = site.draft
  const rows = [
    { href: "/website/pages/start", title: t("website.pages.start"), state: site.exists ? t("website.pages.blocks", { count: d.blocks.filter((b) => b.on).length }) : t("website.pages.standard") },
    { href: "/website/pages/event", title: t("website.pages.event"), state: d.event_html ? t("website.pages.custom") : t("website.pages.standardPage") },
    { href: "/website/pages/portal", title: t("website.pages.portal"), state: d.portal_html ? t("website.pages.custom") : t("website.pages.empty") },
    { href: "/website/pages/frame", title: t("website.pages.frame"), state: d.header_html || d.footer_html ? t("website.pages.custom") : t("website.pages.empty") },
    { href: "/website/pages/legal", title: t("website.pages.legal"), state: d.imprint && d.privacy ? t("website.pages.filled") : t("website.pages.missing") },
  ]
  return (
    <>
      <PageHeader area="website" title={t("website.pages.nav")} description={t("website.pages.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/pages" />
      <ul className="grid divide-y rounded-xl border">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="font-medium">{r.title}</span>
              <span className="ml-auto text-sm text-muted-foreground">{r.state}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export const instant = false
