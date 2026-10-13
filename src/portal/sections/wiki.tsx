import Link from "next/link"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { outsideIndex, portalMember } from "@/wiki/outside"
import type { SectionProps } from "../sections"

// Member area: wiki pages the org released for members (house rules, FAQ, statutes …). Members only.
export async function WikiSection({ orgId, site }: SectionProps) {
  if (!(await portalMember(orgId))) return null
  const pages = await outsideIndex(orgId, "members")
  if (!pages.length) return null
  const t = await getT()
  return (
    <section className="grid gap-3 rounded-xl border p-5" aria-labelledby="portal-wiki">
      <h2 id="portal-wiki" className="font-heading text-lg font-semibold">
        {t("wiki.outside.title")}
      </h2>
      <ul className="grid gap-1.5">
        {pages.map((p) => (
          <li key={p.id}>
            <Link href={sitePath(site, `/portal/wiki/${p.id}`)} className="text-sm underline-offset-4 hover:underline">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
