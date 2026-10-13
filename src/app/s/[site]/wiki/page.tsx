import Link from "next/link"
import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { outsideIndex } from "@/wiki/outside"
import { getSite } from "../data"

// Public wiki of an org: the start pages released publicly (their sub-pages are linked from there).
export default async function PublicWiki({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const s = await getSite(site)
  if (!s) notFound()
  const t = await getT()
  const pages = await outsideIndex(s.org.id, "public")
  if (!pages.length) notFound()
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{s.org.name}</p>
        <h1 className="font-heading text-3xl font-semibold">{t("wiki.outside.title")}</h1>
      </header>
      <ul className="grid gap-2">
        {pages.map((p) => (
          <li key={p.id}>
            <Link href={sitePath(site, `/wiki/${p.id}`)} className="block rounded-lg border px-4 py-3 hover:bg-muted">
              {p.icon && `${p.icon} `}
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
