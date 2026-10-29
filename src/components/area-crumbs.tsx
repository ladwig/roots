"use client"

import { usePathname } from "next/navigation"
import { PageCrumbs } from "@/components/page-crumbs"
import { useT } from "@/i18n/client"
import { within } from "@/lib/url"
import { NAV } from "@/modules/nav"

/** The breadcrumb of a nav area's page, from the nav tree: "Finanzen › Rechnungen" (the first sub-page is the area itself). */
export function AreaCrumbs({ area }: { area: string }) {
  const t = useT()
  const pathname = usePathname()
  const a = NAV.find((x) => x.key === area)
  if (!a) return null
  const sub = a.children
    .filter((c) => within(pathname, c.href))
    .sort((x, y) => y.href.length - x.href.length)[0]
  const own = !sub || sub.href === a.children[0].href // the area's own page (first sub-page)
  return <PageCrumbs items={[{ href: a.children[0].href, label: t.dynamic(a.label) }, ...(own ? [] : [{ label: t.dynamic(sub.label) }])]} />
}
