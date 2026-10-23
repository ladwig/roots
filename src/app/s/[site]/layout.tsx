import { cachedSite } from "@/lib/public-cache"
import { readTheme } from "@/site/theme"
import { getSite } from "./data"
import { SiteFrame } from "./frame"

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
