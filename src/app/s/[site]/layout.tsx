import type { Metadata } from "next"
import { imageUrlOn } from "@/lib/images"
import { cachedSite } from "@/lib/public-cache"
import { readTheme } from "@/site/theme"
import { getSite } from "./data"
import { SiteFrame } from "./frame"

// Link previews (WhatsApp, Slack …), tab title and icon of every public page: the org, never "roots". Pages add their
// own title/description/image on top (event: title, date, picture).
export async function generateMetadata({ params }: LayoutProps<"/s/[site]">): Promise<Metadata> {
  const s = await getSite((await params).site)
  if (!s) return {}
  const site = await cachedSite(s.org.id)
  const logo = imageUrlOn(s.org.logo_path, s.org.site_domain)
  const description = site?.tagline ?? undefined
  return {
    title: { default: s.org.name, template: `%s · ${s.org.name}` },
    description,
    applicationName: s.org.name,
    icons: logo ? { icon: logo, apple: logo } : undefined,
    openGraph: { type: "website", siteName: s.org.name, title: s.org.name, description, images: logo ? [logo] : undefined },
    twitter: { card: "summary", title: s.org.name, description, images: logo ? [logo] : undefined },
  }
}

// Every public page of the org: its brand, header and footer (Website → Marke / Seiten), live version only.
export default async function PublicLayout({ children, params }: LayoutProps<"/s/[site]">) {
  const { site: slug } = await params
  const s = await getSite(slug)
  const site = s ? await cachedSite(s.org.id) : null
  return (
    <SiteFrame slug={slug} content={site ? { ...site, theme: readTheme(site.theme) } : null}>
      {children}
    </SiteFrame>
  )
}
