import { cache } from "react"
import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { getSite } from "@/app/s/[site]/data"
import type { SiteMeta, TemplateKind } from "./blocks"
import { SitePage } from "./render"
import { imprintHtml, privacyHtml, siteMeta } from "./server"

type Page = { title: string; description: string | null; data: unknown }
type Published = { theme: unknown; settings: unknown; nav: { slug: string; title: string }[]; page: Page | null; templates?: Partial<Record<TemplateKind, unknown>> }

const baseOf = (site: string) => {
  const p = sitePath(site, "/")
  return p === "/" ? "" : p
}

/**
 * An org's live website (at least one published page) with everything the frame and blocks need; null = no live site
 * (then the public pages show without the frame). Cached per request: the layout and the page share it.
 */
export const liveSite = cache(async (site: string) => {
  const s = await getSite(site)
  if (!s) return null
  const { data } = await s.db.rpc("public_site", { p_org: s.org.id, p_slug: "" })
  if (!data) return null
  const home = data as unknown as Published
  const t = await getT()
  const { meta, legal } = await siteMeta(s.org, home, baseOf(site), t)
  return { s, home, meta, legal, t }
})

const publishedPage = cache(async (site: string, slug: string) => {
  const live = await liveSite(site)
  if (!live) return null
  const page = slug ? ((await live.s.db.rpc("public_site", { p_org: live.s.org.id, p_slug: slug })).data as unknown as Published | null)?.page : live.home.page
  return { live, page: page ?? null }
})

/** A published page (slug '' = home) or the generated Impressum / Datenschutz, without the frame (the layout adds it). */
export async function PublicSitePage({ site, slug, legal }: { site: string; slug: string; legal?: "imprint" | "privacy" }) {
  const found = await publishedPage(site, legal ? "" : slug)
  if (!found || (!legal && !found.page)) return null
  const { live } = found
  const t = live.t
  const data = legal
    ? {
        root: { props: {} },
        content: [
          { type: "Heading", props: { id: "h", text: legal === "imprint" ? t("sites.imprint") : t("sites.privacy"), level: "h2", align: "left" } },
          {
            type: "Text",
            props: { id: "t", width: "narrow", richtext: legal === "imprint" ? imprintHtml(live.s.org.name, live.legal) : privacyHtml(live.s.org.name, live.legal, live.meta.modules) },
          },
        ],
      }
    : found.page!.data
  return (
    <main>
      <SitePage data={data} meta={live.meta} t={t} />
    </main>
  )
}

export async function publicSiteMetadata(site: string, slug: string): Promise<Metadata> {
  const found = await publishedPage(site, slug)
  if (!found?.page) return {}
  const name = found.live.meta.orgName
  return { title: { absolute: slug ? `${found.page.title} – ${name}` : name }, description: found.page.description ?? undefined }
}

/**
 * The org's own design for a module page (event / form / portal), rendered with the record + the real module UI;
 * null = no live site or no published template → the route shows roots' standard page.
 */
export async function TemplatePage({ site, kind, context, render }: { site: string; kind: TemplateKind; context?: SiteMeta["context"]; render: SiteMeta["render"] }) {
  const live = await liveSite(site)
  const data = live?.home.templates?.[kind]
  if (!live || !data) return null
  return (
    <main>
      <SitePage data={data} meta={{ ...live.meta, context, render }} t={live.t} />
    </main>
  )
}
