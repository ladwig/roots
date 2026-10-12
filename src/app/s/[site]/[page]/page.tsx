import { notFound } from "next/navigation"
import { PublicSitePage, publicSiteMetadata } from "@/sites/public"

// A custom page of the org's website (/<slug>); module paths (e, f, t, g, portal …) are their own routes.
export async function generateMetadata({ params }: PageProps<"/s/[site]/[page]">) {
  const { site, page } = await params
  return publicSiteMetadata(site, page)
}

export default async function SitePageRoute({ params }: PageProps<"/s/[site]/[page]">) {
  const { site, page } = await params
  if (!/^[a-z0-9-]{1,60}$/.test(page)) notFound()
  return (await PublicSitePage({ site, slug: page })) ?? notFound()
}

export const instant = false
