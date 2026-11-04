import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { imageUrl } from "@/lib/images"
import { param, sitePath } from "@/lib/url"
import { cn } from "@/lib/utils"
import { getCart } from "@/shop/cart"
import { deliveriesFor, paymentsFor, priceCart, readShippingRates, shippingCents, subtotalOf, type CatalogProduct, type Delivery, type ShopSettings } from "@/shop/fields"
import { onlineReady } from "@/shop/server"
import { getSite } from "../data"
import { PriceInput, QtyInput } from "./qty"
import { priceInput } from "@/tickets/price"
import { checkout, restoreCart, updateCart } from "../shop/actions"

export async function generateMetadata({ params }: PageProps<"/s/[site]/cart">): Promise<Metadata> {
  const s = await getSite((await params).site)
  const t = await getT()
  return s ? { title: `${t("store.cart")} · ${s.org.name}`, robots: { index: false } } : {}
}

type PublicSettings = ShopSettings & { pickup_text: string | null; terms: string | null; withdrawal: string | null }

// Cart + checkout on one page. Delivery and shipping rate are links (?d=, ?r=) so the total is always computed on the
// server; the form then only asks who orders and how they pay.
export default async function CartPage({ params, searchParams }: PageProps<"/s/[site]/cart">) {
  const { site } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const [{ data: list }, { data: conf }, cart, ready, t] = await Promise.all([
    s.db.rpc("shop_catalog", { p_org: s.org.id }),
    s.db.rpc("shop_public_settings", { p_org: s.org.id }),
    getCart(s.org.id),
    onlineReady(s.org.id),
    getT(),
  ])
  if (!conf) notFound()
  const settings = conf as PublicSettings
  const lines = priceCart(cart, (list ?? []) as CatalogProduct[])
  const deliveries = lines.length ? deliveriesFor(settings, lines) : []
  const delivery = (deliveries.find((d) => d === param(sp, "d")) ?? deliveries[0]) as Delivery | undefined
  const rates = readShippingRates(settings.shipping_rates)
  const rate = delivery === "shipping" ? (rates.find((r) => r.id === param(sp, "r")) ?? rates[0]) : undefined
  const subtotal = subtotalOf(lines)
  const shipping = rate ? shippingCents(rate, subtotal) : 0
  const total = subtotal + shipping
  const payments = delivery ? paymentsFor(settings, delivery, ready) : []
  const problems = lines.some((l) => l.problem) || lines.length !== cart.length
  const digital = lines.some((l) => l.digital)
  const legal = !!(settings.terms || settings.withdrawal)
  const keep = new URLSearchParams([...(delivery ? [["d", delivery]] : []), ...(rate ? [["r", rate.id]] : [])]).toString()
  const link = (d: Delivery, r?: string) => sitePath(site, `/cart?${new URLSearchParams([["d", d], ...(r ? [["r", r]] : [])])}`)
  const regions = new Intl.DisplayNames([t.locale], { type: "region" })
  const backOrder = param(sp, "back")

  return (
    <main className="site-cart mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <Link href={sitePath(site, "/shop")} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("store.continueShopping")}
      </Link>
      <h1 className="font-heading text-2xl font-semibold">{t("store.cart")}</h1>
      <Notice error={param(sp, "error")} />
      {backOrder && !cart.length && (
        <form action={restoreCart} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted px-3 py-2 text-sm">
          <input type="hidden" name="site" value={site} />
          <input type="hidden" name="order" value={backOrder} />
          <input type="hidden" name="k" value={param(sp, "k") ?? ""} />
          <span>{t("store.paymentCancelled")}</span>
          <SubmitButton size="sm" variant="outline">
            {t("store.restoreCart")}
          </SubmitButton>
        </form>
      )}
      {!lines.length ? (
        <p className="text-muted-foreground">
          {t("store.cartEmpty")}{" "}
          <Link href={sitePath(site, "/shop")} className="underline underline-offset-4">
            {t("store.toShop")}
          </Link>
        </p>
      ) : (
        <>
          <ul className="grid divide-y rounded-xl border">
            {lines.map((l) => (
              <li key={l.id} className="grid grid-cols-[3.5rem_1fr] gap-3 p-3 sm:grid-cols-[3.5rem_1fr_auto] sm:items-center">
                <div className="size-14 overflow-hidden rounded-lg border bg-muted">
                  {l.product.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
                    <img src={imageUrl(l.product.images[0])} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={sitePath(site, `/shop/${l.product.slug}`)} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  {l.nyp ? (
                    // Name your price: the amount is editable here, at least the minimum.
                    <form action={updateCart} className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <input type="hidden" name="site" value={site} />
                      <input type="hidden" name="item" value={l.id} />
                      <input type="hidden" name="q" value={l.quantity} />
                      <input type="hidden" name="keep" value={keep} />
                      <span>{t("store.yourPrice")}</span>
                      <PriceInput
                        defaultValue={priceInput(l.unit)}
                        label={t("store.yourPrice")}
                        fallback={
                          <SubmitButton size="sm" variant="ghost">
                            {t("store.update")}
                          </SubmitButton>
                        }
                      />
                      <span>€ · {t("store.atLeast", { price: t.money(l.min, "eur") })}</span>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.money(l.unit, "eur")}</p>
                  )}
                  {l.problem && <p className="text-sm text-destructive">{t.dynamic(`store.lineProblem.${l.problem}`, { max: l.product.max_per_order, price: t.money(l.min, "eur") })}</p>}
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1">
                  {l.trackId ? (
                    <span className="text-sm text-muted-foreground">{t("store.singleTrack")}</span>
                  ) : (
                  <form action={updateCart} className="flex items-center gap-1">
                    <input type="hidden" name="site" value={site} />
                    <input type="hidden" name="item" value={l.id} />
                    <input type="hidden" name="keep" value={keep} />
                    <QtyInput
                      defaultValue={l.quantity}
                      max={l.product.max_per_order}
                      label={t("store.qty")}
                      fallback={
                        <SubmitButton size="sm" variant="ghost">
                          {t("store.update")}
                        </SubmitButton>
                      }
                    />
                  </form>
                  )}
                  <form action={updateCart}>
                    <input type="hidden" name="site" value={site} />
                    <input type="hidden" name="item" value={l.id} />
                    <input type="hidden" name="q" value="0" />
                    <input type="hidden" name="keep" value={keep} />
                    <SubmitButton size="icon" variant="ghost" aria-label={t("store.remove")}>
                      <Trash2Icon />
                    </SubmitButton>
                  </form>
                  <span className="w-20 text-right tabular-nums">{t.money(l.quantity * l.unit, "eur")}</span>
                </div>
              </li>
            ))}
          </ul>

          {deliveries.length > 1 || delivery === "shipping" ? (
            <section className="grid gap-2" aria-labelledby="delivery">
              <h2 id="delivery" className="font-medium">
                {t("store.delivery")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {deliveries.flatMap((d) =>
                  d === "shipping"
                    ? rates.map((r) => (
                        <Link key={r.id} href={link("shipping", r.id)} className={cn("rounded-lg border px-3 py-2 text-sm", rate?.id === r.id ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                          {r.name} · {shippingCents(r, subtotal) === 0 ? t("store.free") : t.money(r.cents, "eur")}
                        </Link>
                      ))
                    : [
                        <Link key={d} href={link(d)} className={cn("rounded-lg border px-3 py-2 text-sm", delivery === d ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                          {t.dynamic(`store.deliveries.${d}`)}
                        </Link>,
                      ],
                )}
              </div>
              {rate?.free_from && shipping > 0 && <p className="text-sm text-muted-foreground">{t("store.freeFrom", { amount: t.money(rate.free_from, "eur") })}</p>}
            </section>
          ) : null}
          {delivery === "pickup" && settings.pickup_text && <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm">{settings.pickup_text}</p>}
          {!deliveries.length && <p className="text-sm text-destructive">{t("store.noDelivery")}</p>}

          <div className="grid gap-1 text-sm">
            <p className="flex justify-between">
              <span>{t("store.subtotal")}</span>
              <span className="tabular-nums">{t.money(subtotal, "eur")}</span>
            </p>
            {rate && (
              <p className="flex justify-between">
                <span>{t("store.shippingLine")}</span>
                <span className="tabular-nums">{shipping === 0 ? t("store.free") : t.money(shipping, "eur")}</span>
              </p>
            )}
            <p className="flex justify-between text-base font-medium">
              <span>{t("store.total")}</span>
              <span className="tabular-nums">{t.money(total, "eur")}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("store.vatIncluded")}</p>
          </div>

          {delivery && !problems && (
            <form action={checkout} className="grid gap-5 border-t pt-6">
              <input type="hidden" name="site" value={site} />
              <input type="hidden" name="delivery" value={delivery} />
              {rate && <input type="hidden" name="rate" value={rate.id} />}
              <input type="hidden" name="total" value={total} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="buyer-name">{t("store.name")}</Label>
                  <Input id="buyer-name" name="name" required maxLength={200} autoComplete="name" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="buyer-email">{t("store.email")}</Label>
                  <Input id="buyer-email" name="email" type="email" required autoComplete="email" />
                </div>
              </div>
              {delivery === "shipping" ? (
                <fieldset className="grid gap-3">
                  <legend className="mb-2 font-medium">{t("store.shippingAddress")}</legend>
                  <AddressFields t={t} required countries={rate!.countries} regions={regions} />
                </fieldset>
              ) : (
                <details className="rounded-lg border px-3 py-2">
                  <summary className="cursor-pointer text-sm">{t("store.billingAddressOptional")}</summary>
                  <div className="grid gap-3 pt-3">
                    <AddressFields t={t} required={false} countries={null} regions={regions} />
                  </div>
                </details>
              )}
              <div className="grid gap-2">
                <Label htmlFor="note">{t("store.note")}</Label>
                <textarea id="note" name="note" maxLength={2000} rows={2} className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm" />
              </div>
              {total > 0 &&
                (payments.length ? (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 font-medium">{t("store.payment")}</legend>
                    {payments.map((p, i) => (
                      <label key={p} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary">
                        <input type="radio" name="payment" value={p} defaultChecked={i === 0} required className="mt-0.5 accent-primary" />
                        <span>
                          {t.dynamic(`store.payments.${p}`)}
                          <span className="block text-xs text-muted-foreground">{t.dynamic(`store.paymentHints.${p}`)}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p className="text-sm text-destructive">{t("store.noPayment")}</p>
                ))}
              {legal && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="hidden" name="terms_required" value="1" />
                  <input type="checkbox" name="terms" value="1" required className="mt-0.5 accent-primary" />
                  <span>
                    {t("store.acceptTerms")}{" "}
                    {settings.terms && (
                      <Link href={sitePath(site, "/shop/agb")} target="_blank" className="underline">
                        {t("store.terms")}
                      </Link>
                    )}
                    {settings.terms && settings.withdrawal && " · "}
                    {settings.withdrawal && (
                      <Link href={sitePath(site, "/shop/widerruf")} target="_blank" className="underline">
                        {t("store.withdrawal")}
                      </Link>
                    )}
                  </span>
                </label>
              )}
              {digital && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="hidden" name="waiver_required" value="1" />
                  <input type="checkbox" name="waiver" value="1" required className="mt-0.5 accent-primary" />
                  <span>{t("store.digitalWaiver")}</span>
                </label>
              )}
              {(total === 0 || payments.length > 0) && (
                <SubmitButton className="justify-self-start">{total === 0 ? t("store.orderFree") : t("store.orderPay", { amount: t.money(total, "eur") })}</SubmitButton>
              )}
            </form>
          )}
        </>
      )}
    </main>
  )
}

function AddressFields({ t, required, countries, regions }: { t: Awaited<ReturnType<typeof getT>>; required: boolean; countries: string[] | null; regions: Intl.DisplayNames }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="company">{t("store.company")}</Label>
        <Input id="company" name="company" maxLength={200} autoComplete="organization" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="street">{t("store.street")}</Label>
        <Input id="street" name="street" required={required} maxLength={200} autoComplete="street-address" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="postal_code">{t("store.postalCode")}</Label>
        <Input id="postal_code" name="postal_code" required={required} maxLength={20} autoComplete="postal-code" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="city">{t("store.city")}</Label>
        <Input id="city" name="city" required={required} maxLength={100} autoComplete="address-level2" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="country">{t("store.country")}</Label>
        {countries ? (
          <select id="country" name="country" defaultValue={countries[0]} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" autoComplete="country">
            {countries.map((c) => (
              <option key={c} value={c}>
                {regions.of(c) ?? c}
              </option>
            ))}
          </select>
        ) : (
          <Input id="country" name="country" defaultValue="DE" maxLength={2} className="w-20 uppercase" autoComplete="country" />
        )}
      </div>
    </div>
  )
}

export const instant = false
