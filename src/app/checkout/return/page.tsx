import Link from "next/link"
import { getT } from "@/i18n/server"
import { param } from "@/lib/url"
import { publicOrderStatus } from "@/payments/server"

// Where buyers land after the hosted checkout. Shows the status only; fulfilment happens via webhook, not here.
// ponytail: lives on the App surface for now; moves to the org's public site with Ticketing.
export default async function CheckoutReturn({ searchParams }: PageProps<"/checkout/return">) {
  const sp = await searchParams
  const t = await getT()
  const orderId = param(sp, "order") ?? ""
  const order = await publicOrderStatus(orderId)
  const cancelled = param(sp, "cancelled") === "1" && order?.status === "open"
  const message = !order
    ? t("checkout.notFound")
    : cancelled
      ? t("checkout.cancelled")
      : ["paid", "refunded", "partially_refunded"].includes(order.status)
        ? t("checkout.paid")
        : order.status === "failed"
          ? t("checkout.failed")
          : order.status === "expired"
            ? t("checkout.expired")
            : t("checkout.open")

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
      {order && <p className="text-sm text-muted-foreground">{order.orgs?.name}</p>}
      <h1 className="font-heading text-2xl font-semibold">
        {order ? `${t("checkout.title")} · ${t.money(order.amount_total, order.currency)}` : t("checkout.title")}
      </h1>
      <p>{message}</p>
      {order?.status === "open" && !cancelled && (
        <Link href={`/checkout/return?order=${orderId}`} className="text-sm underline underline-offset-4">
          {t("checkout.refresh")}
        </Link>
      )}
    </main>
  )
}

// Reads URL/data at request time.
export const instant = false
