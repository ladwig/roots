import { notFound } from "next/navigation"
import { SiteFrame } from "@/app/s/[site]/frame"
import { SiteHome } from "@/app/s/[site]/home"
import { requirePerm } from "@/lib/context"
import { cachedSite } from "@/lib/public-cache"
import { createPublicClient } from "@/lib/supabase/server"
import { loadSite } from "@/site/server"

// The draft of the start page with brand, header and footer, exactly as the public page renders it – for the preview
// next to the editors in Website. Outside the App shell (own page in an iframe); website editors only.
export default async function SitePreview() {
  const ctx = await requirePerm("org.site.manage")
  const [{ draft }, live] = await Promise.all([loadSite(ctx.supabase, ctx.org.id), cachedSite(ctx.org.id)])
  if (!live) notFound()
  return (
    <SiteFrame slug={ctx.org.slug} content={draft}>
      <SiteHome slug={ctx.org.slug} org={ctx.org} db={createPublicClient()} tagline={draft.tagline} blocks={draft.blocks} modules={live.modules} forms={live.forms} />
    </SiteFrame>
  )
}

export const instant = false
