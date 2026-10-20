import Link from "next/link"
import { getT } from "@/i18n/server"
import { cachedSite } from "@/lib/public-cache"
import { sitePath } from "@/lib/url"
import { getSite } from "./data"

// Every public page of the org gets the Impressum / Datenschutz links (Settings → Website) at the bottom.
export default async function PublicLayout({ children, params }: LayoutProps<"/s/[site]">) {
  const { site: slug } = await params
  const s = await getSite(slug)
  const [site, t] = await Promise.all([s ? cachedSite(s.org.id) : null, getT()])
  return (
    <>
      {children}
      {(site?.imprint || site?.privacy) && (
        <footer className="mx-auto flex max-w-2xl flex-wrap gap-4 px-4 pt-4 pb-10 text-sm text-muted-foreground">
          {site.imprint && (
            <Link href={sitePath(slug, "/impressum")} className="hover:text-foreground">
              {t("site.imprint")}
            </Link>
          )}
          {site.privacy && (
            <Link href={sitePath(slug, "/datenschutz")} className="hover:text-foreground">
              {t("site.privacy")}
            </Link>
          )}
        </footer>
      )}
    </>
  )
}
