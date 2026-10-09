import { notFound } from "next/navigation"
import { DownloadIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { param, sitePath } from "@/lib/url"
import { qrSvg, ticketsForBuyer } from "@/tickets/server"
import { getSite } from "../../data"

// The buyer's tickets (link from the payment success page / email). Access = order id + secret token.
export default async function BuyerTickets({ params, searchParams }: PageProps<"/s/[site]/t/[order]">) {
  const { site, order } = await params
  const sp = await searchParams
  const s = await getSite(site)
  const data = s && (await ticketsForBuyer(order, param(sp, "k") ?? ""))
  if (!s || !data || data.order.org_id !== s.org.id) notFound()
  const t = await getT()
  const valid = data.tickets.filter((k) => k.status === "valid" || k.status === "used")
  const qrs = await Promise.all(valid.map((k) => qrSvg(k.code)))

  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold">{t("shop.yourTickets")}</h1>
      {data.order.status !== "paid" ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {data.order.status === "open" ? t("shop.waiting") : t.dynamic(`shop.orderStatus.${data.order.status}`)}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">{t("shop.keepLink")}</p>
          <Button render={<a href={`${sitePath(site, `/t/${order}/pdf`)}?k=${param(sp, "k")}`} />} nativeButton={false} size="sm" variant="outline">
            <DownloadIcon /> {t("shop.pdf")}
          </Button>
        </div>
      )}
      <ul className="grid gap-4">
        {valid.map((k, i) => (
          <li key={k.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid gap-1">
              <p className="font-medium">{k.events?.title}</p>
              <p className="text-sm text-muted-foreground">
                {k.events && t.date(k.events.starts_at, { dateStyle: "full", timeStyle: "short" })}
                {k.events?.venue_name && ` · ${k.events.venue_name}`}
              </p>
              <p className="text-sm">
                {k.ticket_types?.name}
                {k.holder_name && ` · ${k.holder_name}`}
              </p>
              <p className="font-mono text-sm tracking-widest">{k.code}</p>
              {k.status === "used" && <Badge variant="secondary">{t("shop.used")}</Badge>}
            </div>
            {/* QR is generated on our server from the code alone; white on purpose (scanners need dark-on-light). */}
            <div
              className="size-40 justify-self-center rounded-lg bg-white p-2 [&_svg]:size-full"
              role="img"
              aria-label={t("shop.qr", { code: k.code })}
              dangerouslySetInnerHTML={{ __html: qrs[i] }}
            />
          </li>
        ))}
      </ul>
    </main>
  )
}

export const instant = false
