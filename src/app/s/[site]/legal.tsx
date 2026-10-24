import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Markdown } from "@/components/markdown"
import { getT } from "@/i18n/server"
import { cachedSite } from "@/lib/public-cache"
import { sitePath } from "@/lib/url"
import { getSite } from "./data"

// Impressum / Datenschutz of an org (Markdown from Settings → Website); 404 while empty.
export async function legalMeta(slug: string, which: "imprint" | "privacy"): Promise<Metadata> {
  const [s, t] = await Promise.all([getSite(slug), getT()])
  return s ? { title: t(`site.${which}`), robots: { index: false } } : {}
}

export async function LegalPage({ slug, which }: { slug: string; which: "imprint" | "privacy" }) {
  const s = await getSite(slug)
  if (!s) notFound()
  const [site, t] = await Promise.all([cachedSite(s.org.id), getT()])
  const text = site?.[which]
  if (!text) notFound()
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-4 py-12">
      <Link href={sitePath(slug, "/")} className="text-sm text-muted-foreground hover:text-foreground">
        ← {s.org.name}
      </Link>
      <h1 className="font-heading text-2xl font-semibold">{t(`site.${which}`)}</h1>
      <div>
        <Markdown>{text}</Markdown>
      </div>
    </main>
  )
}
