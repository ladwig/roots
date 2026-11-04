import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Markdown } from "@/components/markdown"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { getSite } from "../data"

// The shop's AGB / Widerrufsbelehrung (Markdown from Shop → Einstellungen); 404 while empty.
const KEY = { terms: "store.terms", withdrawal: "store.withdrawal" } as const

export async function shopLegalMeta(slug: string, which: keyof typeof KEY): Promise<Metadata> {
  const [s, t] = await Promise.all([getSite(slug), getT()])
  return s ? { title: `${t(KEY[which])} · ${s.org.name}`, robots: { index: false } } : {}
}

export async function ShopLegal({ slug, which }: { slug: string; which: keyof typeof KEY }) {
  const s = await getSite(slug)
  if (!s) notFound()
  const [{ data }, t] = await Promise.all([s.db.rpc("shop_public_settings", { p_org: s.org.id }), getT()])
  const text = (data as Record<string, string | null> | null)?.[which]
  if (!text) notFound()
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-4 py-12">
      <Link href={sitePath(slug, "/shop")} className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("store.shopTitle")}
      </Link>
      <h1 className="font-heading text-2xl font-semibold">{t(KEY[which])}</h1>
      <div>
        <Markdown>{text}</Markdown>
      </div>
    </main>
  )
}
