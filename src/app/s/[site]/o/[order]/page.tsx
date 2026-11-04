import { notFound } from "next/navigation"
import { CircleCheckIcon, DownloadIcon, FileTextIcon, MusicIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { param, sitePath } from "@/lib/url"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcileOrder } from "@/payments/server"
import { orderFiles, orderForBuyer, orderMusic, orderUnreleased } from "@/shop/server"
import { AutoRefresh } from "../../t/[order]/auto-refresh"
import { getSite } from "../../data"

const FORMATS = ["wav", "mp3"] as const
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`

// The buyer's shop order (link from the payment success page / emails). Access = order id + secret token.
export default async function BuyerOrder({ params, searchParams }: PageProps<"/s/[site]/o/[order]">) {
  const { site, order } = await params
  const sp = await searchParams
  const k = param(sp, "k") ?? ""
  const s = await getSite(site)
  let o = s && (await orderForBuyer(order, k))
  if (!s || !o || o.org_id !== s.org.id) notFound()
  if (o.pay_orders.status === "open" && o.payment === "online") {
    await reconcileOrder(order).catch((e) => console.error("reconcile", order, e))
    o = (await orderForBuyer(order, k))!
  }
  const t = await getT()
  const cur = o.pay_orders.currency
  const paid = ["paid", "partially_refunded"].includes(o.pay_orders.status)
  const [files, music, later, { data: bank }, { data: inv }] = await Promise.all([
    orderFiles(o),
    orderMusic(o),
    orderUnreleased(o),
    o.payment === "transfer" && !paid ? createAdminClient().from("org_billing").select("legal_name, iban, bic").eq("org_id", o.org_id).maybeSingle() : Promise.resolve({ data: null }),
    o.invoice_id ? createAdminClient().from("documents").select("status, number").eq("id", o.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const withToken = (path: string) => `${sitePath(site, path)}?k=${k}`

  return (
    <main className="site-order-page mx-auto grid max-w-xl gap-6 px-4 py-12">
      {param(sp, "paid") && paid && (
        <div className="site-success grid justify-items-center gap-2 rounded-xl border bg-muted/50 px-4 py-6 text-center">
          <CircleCheckIcon className="size-12 text-primary" aria-hidden />
          <p className="font-heading text-xl font-semibold">{t("store.orderThanks")}</p>
          <p className="text-sm text-muted-foreground">{t("store.orderMailed", { email: o.pay_orders.customer_email ?? "" })}</p>
        </div>
      )}
      <header className="grid gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t("store.orderTitle", { number: String(o.number) })}</h1>
        <p className="text-sm text-muted-foreground">
          {s.org.name} · {t.date(o.created_at, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"}>{t.dynamic(`store.orderStatus.${o.status}`)}</Badge>
          {o.status !== "cancelled" && <Badge variant={paid ? "secondary" : "outline"}>{paid ? t("store.paid") : t("store.unpaid")}</Badge>}
        </div>
      </header>

      {o.pay_orders.status === "open" && o.payment === "online" && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("store.waiting")}
          <AutoRefresh />
        </p>
      )}
      {!paid && o.status !== "cancelled" && o.payment === "transfer" && bank?.iban && (
        <section className="grid gap-1 rounded-lg border px-3 py-3 text-sm">
          <p className="font-medium">{t("store.transfer.title", { date: o.pay_orders.expires_at ? t.date(o.pay_orders.expires_at, { dateStyle: "medium" }) : "" })}</p>
          <p>{t("store.transfer.holder", { holder: bank.legal_name ?? s.org.name })}</p>
          <p className="font-mono">IBAN: {bank.iban.replace(/(.{4})/g, "$1 ").trim()}</p>
          {bank.bic && <p className="font-mono">BIC: {bank.bic}</p>}
          <p>{t("store.transfer.amount", { amount: t.money(o.pay_orders.amount_total, cur) })}</p>
          <p>{t("store.transfer.reference", { reference: t("store.transfer.referenceText", { number: String(o.number) }) })}</p>
        </section>
      )}
      {!paid && o.status !== "cancelled" && o.payment === "pickup" && <p className="rounded-lg border px-3 py-2 text-sm">{t("store.payOnPickupNote")}</p>}

      <ul className="grid divide-y rounded-xl border text-sm">
        {o.pay_orders.pay_order_items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3 px-3 py-2">
            <span>
              {i.quantity}× {i.description}
            </span>
            <span className="tabular-nums">{t.money(i.quantity * i.unit_amount, cur)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 px-3 py-2 font-medium">
          <span>{t("store.total")}</span>
          <span className="tabular-nums">{t.money(o.pay_orders.amount_total, cur)}</span>
        </li>
      </ul>

      <section className="grid gap-1 text-sm">
        <p className="font-medium">{t.dynamic(`store.deliveries.${o.delivery}`)}</p>
        {o.delivery === "shipping" && (
          <p className="whitespace-pre-line text-muted-foreground">
            {[o.company, o.name, o.street, `${o.postal_code} ${o.city}`, o.country].filter(Boolean).join("\n")}
          </p>
        )}
        {o.tracking && <p>{t("store.trackingLine", { tracking: o.tracking })}</p>}
      </section>

      {later.map((p) => (
        <p key={p.id} className="site-release rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          {t("store.releaseLater", { name: p.name, date: t.date(p.release_at, { dateStyle: "long" }) })}
        </p>
      ))}
      {music.map((m) => (
        // Bandcamp-style: the whole album as ZIP or single tracks, in every format (links are made fresh on each click).
        <section key={m.productId} className="site-music-downloads grid gap-3 rounded-xl border p-4">
          <h2 className="flex items-center gap-2 font-medium">
            <MusicIcon className="size-4" aria-hidden /> {m.name}
          </h2>
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">{t("store.albumZip")}</p>
            {m.zip ? (
              <Button render={<a href={withToken(`/o/${order}/audio/${m.productId}/zip`)} />} nativeButton={false} size="sm" className="justify-self-start">
                <DownloadIcon /> {t("store.albumZipButton")} · {mb(m.zip)}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t("store.zipsPreparing")}</p>
            )}
          </div>
          <ol className="grid divide-y rounded-lg border text-sm">
            {m.tracks.map((x, i) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                {FORMATS.map((f) =>
                  x.sizes[f] ? (
                    <a key={f} href={withToken(`/o/${order}/audio/${m.productId}/${f}`) + `&t=${x.id}`} className="rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
                      {t.dynamic(`store.audioFormats.${f}`)}
                    </a>
                  ) : null,
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {files.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-medium">{t("store.downloads")}</h2>
          <ul className="grid gap-2">
            {files.map((f) => (
              <li key={f.id}>
                <Button render={<a href={withToken(`/o/${order}/file/${f.id}`)} />} nativeButton={false} variant="outline" size="sm">
                  <DownloadIcon /> {f.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inv && inv.status !== "draft" && (
        <Button render={<a href={withToken(`/o/${order}/invoice`)} />} nativeButton={false} variant="outline" size="sm" className="justify-self-start">
          <FileTextIcon /> {t("store.invoiceDownload", { number: inv.number ?? "" })}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t("store.keepOrderLink")}</p>
    </main>
  )
}

export const instant = false
