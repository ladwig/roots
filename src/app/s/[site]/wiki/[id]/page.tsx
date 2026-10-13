import { notFound } from "next/navigation"
import { sitePath } from "@/lib/url"
import { outsidePage } from "@/wiki/outside"
import { OutsideView } from "@/wiki/outside-view"
import { getSite } from "../../data"

// A publicly released wiki page (and the released pages around it). Live, not cached: edits show at once.
export default async function PublicWikiPage({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site, id } = await params
  const s = await getSite(site)
  if (!s) notFound()
  const page = await outsidePage(s.org.id, id, "public")
  if (!page) notFound()
  return <OutsideView org={s.org.name} page={page} href={(p) => sitePath(site, `/wiki/${p}`)} fileHref={(f) => sitePath(site, `/wiki/file/${f}`)} />
}
