// Public surface (<org>.ROOT_DOMAIN, an own domain, or /s/<org>): the org's start page, built from the blocks set in
// Website → Seiten (src/site/blocks.ts). Without a saved site: the upcoming events, as before. Only published data.
// ponytail: public pages will use the org's language, not the visitor cookie.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cachedSite } from "@/lib/public-cache"
import { DEFAULT_BLOCKS, readBlocks } from "@/site/blocks"
import { getSite } from "./data"
import { SiteHome } from "./home"

export async function generateMetadata({ params }: PageProps<"/s/[site]">): Promise<Metadata> {
  const s = await getSite((await params).site)
  return s ? { title: { absolute: s.org.name } } : {} // the rest (description, logo, site name) comes from the layout
}

export default async function PublicSite({ params }: PageProps<"/s/[site]">) {
  const { site: slug } = await params
  const s = await getSite(slug)
  if (!s) notFound()
  const site = await cachedSite(s.org.id)
  return (
    <SiteHome
      slug={slug}
      org={s.org}
      db={s.db}
      tagline={site?.tagline ?? null}
      blocks={site?.saved ? readBlocks(site.blocks) : DEFAULT_BLOCKS}
      modules={site?.modules ?? []}
      forms={site?.forms ?? []}
      home={{ mode: site?.home_mode ?? "blocks", html: site?.home_html ?? null }}
      legal={{ imprint: !!site?.imprint, privacy: !!site?.privacy }}
    />
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
