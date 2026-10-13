import { notFound, redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { outsidePage, portalMember } from "@/wiki/outside"
import { OutsideView } from "@/wiki/outside-view"
import { getSite } from "../../../data"

// A wiki page released for members, inside the member area (signed-in contact with an active membership).
export default async function MemberWikiPage({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site, id } = await params
  const s = await getSite(site)
  if (!s) notFound()
  if (!(await portalMember(s.org.id))) redirect(sitePath(site, "/portal"))
  const page = await outsidePage(s.org.id, id, "members")
  if (!page) notFound()
  const t = await getT()
  return (
    <OutsideView
      org={s.org.name}
      page={page}
      href={(p) => sitePath(site, `/portal/wiki/${p}`)}
      fileHref={(f) => sitePath(site, `/wiki/file/${f}`)}
      back={{ href: sitePath(site, "/portal"), label: t("portal.title") }}
    />
  )
}
