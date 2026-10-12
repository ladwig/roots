import { SiteFrame } from "@/sites/blocks"
import { liveSite } from "@/sites/public"

// Every public page of an org (website pages, events, forms, checkout, tickets, portal) sits in the website's frame
// and theme once the org has a live website (module sites, published home page); otherwise it shows plain.
export default async function PublicLayout({ children, params }: LayoutProps<"/s/[site]">) {
  const live = await liveSite((await params).site)
  return live ? <SiteFrame meta={live.meta}>{children}</SiteFrame> : children
}
