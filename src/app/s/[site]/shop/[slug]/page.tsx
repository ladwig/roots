import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { imageUrl, imageUrlOn } from "@/lib/images"
import { param, sitePath } from "@/lib/url"
import { cleanHtml } from "@/site/html"
import { suggestedPrice, videoEmbed, type CatalogProduct } from "@/shop/fields"
import { playerTracks } from "@/shop/audio"
import { getSite } from "../../data"
import { Gallery } from "./gallery"
import { priceInput } from "@/tickets/price"
import { MusicPlayer } from "./player"
import { addToCart } from "../actions"
import { priceLabel, soldOut } from "@/shop/view"

async function load(site: string, slug: string) {
  const s = await getSite(site)
  if (!s) return null
  const { data } = await s.db.rpc("shop_catalog", { p_org: s.org.id, p_slug: slug })
  const p = ((data ?? []) as CatalogProduct[])[0]
  return p ? { s, p } : null
}

export async function generateMetadata({ params }: PageProps<"/s/[site]/shop/[slug]">): Promise<Metadata> {
  const { site, slug } = await params
  const r = await load(site, slug)
  if (!r) return {}
  const image = imageUrlOn(r.p.images[0] ?? r.s.org.logo_path, r.s.org.site_domain)
  const description = (r.p.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || undefined
  return {
    title: `${r.p.name} · ${r.s.org.name}`,
    description,
    openGraph: { type: "website", siteName: r.s.org.name, title: r.p.name, description, images: image ? [image] : undefined },
  }
}

// One product: pictures, video, description, variant + quantity → into the cart.
export default async function ProductPage({ params, searchParams }: PageProps<"/s/[site]/shop/[slug]">) {
  const { site, slug } = await params
  const sp = await searchParams
  const r = await load(site, slug)
  if (!r) notFound()
  const { p } = r
  const [t, tracks] = await Promise.all([getT(), playerTracks(r.s.org.id, p.id)])
  const video = videoEmbed(p.video_url)
  const gone = soldOut(p)
  const first = p.variants.find((v) => v.left !== 0)
  const nyp = p.variants.length ? p.variants.some((v) => v.name_your_price) : !!p.name_your_price
  const minPrice = p.variants.length ? Math.min(...p.variants.filter((v) => v.name_your_price).map((v) => v.price_cents)) : p.price_cents

  return (
    <main className="site-product mx-auto grid max-w-5xl gap-8 px-4 py-12">
      <Link href={sitePath(site, "/shop")} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("store.shopTitle")}
      </Link>
      <Notice error={param(sp, "error")} />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid content-start gap-3">
          {p.images.length > 0 ? <Gallery images={p.images.map((x) => imageUrl(x)!)} alt={p.name} /> : <div className="aspect-square rounded-xl border bg-muted" />}
        </div>
        <div className="grid content-start gap-4">
          <h1 className="font-heading text-3xl font-semibold">{p.name}</h1>
          <p className="text-xl">{priceLabel(p, t)}</p>
          <p className="text-xs text-muted-foreground">{t(p.kind === "digital" ? "store.vatDigital" : "store.vatShipping")}</p>
          {p.release_at && <p className="site-release rounded-lg bg-muted px-3 py-2 text-sm">{t("store.releaseNote", { date: t.date(p.release_at, { dateStyle: "long" }) })}</p>}
          {tracks.length > 0 && (
            <MusicPlayer
              tracks={tracks.map((x) => ({ id: x.id, title: x.title, duration: x.duration, src: x.stream ? sitePath(site, `/shop/${slug}/track/${x.id}`) : null, buy: !gone && !!p.tracks?.some((b) => b.id === x.id) }))}
              buy={p.track_price_cents != null ? { site, slug, label: p.name_your_price ? t("store.orMore", { price: t.money(p.track_price_cents, "eur") }) : t.money(p.track_price_cents, "eur") } : null}
              cover={p.images[0] ? imageUrl(p.images[0])! : null}
              artist={r.s.org.name}
            />
          )}
          {gone ? (
            <p className="font-medium text-muted-foreground">{t("store.soldOut")}</p>
          ) : (
            <form action={addToCart} className="grid gap-3">
              <input type="hidden" name="site" value={site} />
              <input type="hidden" name="slug" value={slug} />
              {p.variants.length > 0 ? (
                <div className="grid gap-1">
                  <Label htmlFor="item">{t("store.variant")}</Label>
                  <select id="item" name="item" defaultValue={first?.id} required className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                    {p.variants.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.left === 0}>
                        {v.name} · {v.name_your_price ? t("store.orMore", { price: t.money(v.price_cents, "eur") }) : t.money(v.price_cents, "eur")}
                        {v.left === 0 ? ` · ${t("store.soldOut")}` : v.left !== null && v.left <= 5 ? ` · ${t("store.left", { count: v.left })}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <input type="hidden" name="item" value={p.id} />
                  {p.left !== null && p.left <= 5 && <p className="text-sm text-muted-foreground">{t("store.left", { count: p.left })}</p>}
                </>
              )}
              {nyp && (
                // Name your price: pre-filled with the suggestion; the minimum is checked in the cart and at checkout.
                <div className="grid gap-1">
                  <Label htmlFor="price">{t("store.yourPrice")}</Label>
                  <div className="flex items-center gap-2">
                    <Input id="price" name="price" inputMode="decimal" defaultValue={priceInput(suggestedPrice(p, minPrice))} className="w-28 text-right" />
                    <span className="text-sm text-muted-foreground">€ · {t("store.atLeast", { price: t.money(minPrice, "eur") })}</span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="qty">{t("store.qty")}</Label>
                  <Input id="qty" name="q" type="number" min={1} max={p.max_per_order} defaultValue={1} className="w-20" />
                </div>
                <SubmitButton>{t("store.addToCart")}</SubmitButton>
              </div>
            </form>
          )}
          {p.description && <div className="site-product-description text-sm [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: cleanHtml(p.description) }} />}
        </div>
      </div>
      {video &&
        (video.kind === "iframe" ? (
          <iframe
            src={video.src}
            title={p.name}
            className="aspect-video w-full rounded-xl border"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          <video src={video.src} controls preload="metadata" className="aspect-video w-full rounded-xl border bg-black" />
        ))}
    </main>
  )
}

export const instant = false
