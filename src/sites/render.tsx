import { Render } from "@puckeditor/core/rsc"
import type { getT } from "@/i18n/server"
import { siteConfig, type SiteMeta } from "./blocks"
import "./site.css"

/** A published website page, rendered on the server with the same blocks the editor uses. */
export function SitePage({ data, meta, t }: { data: unknown; meta: SiteMeta; t: Awaited<ReturnType<typeof getT>> }) {
  const config = siteConfig(t)
  // Data comes from the DB (checked by sanitizePage on save); Puck's generic types can't know that.
  return <Render config={config} data={data as Parameters<typeof Render<typeof config>>[0]["data"]} metadata={meta} />
}
