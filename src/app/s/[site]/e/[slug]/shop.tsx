import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { passOnFor } from "@/payments/server"
import { waitlistClaim } from "@/tickets/waitlist"
import { getSite } from "../../data"
import { SubmitButton } from "@/components/submit-button"
import { joinWaitlistAction } from "./actions"

// Ticket types with quantity fields; a plain GET form to the checkout step (works without JS).
// Free events say "Anmeldung"; sold out → waiting list; ?w=<token> = a waiting-list offer with held seats.
export async function TicketShop({ site, slug, eventId, max, code, waitlist }: { site: string; slug: string; eventId: string; max: number; code: string | null; waitlist: string | null }) {
  const s = (await getSite(site))!
  const [{ data: offer }, claim, fee] = await Promise.all([
    s.db.rpc("ticket_offer", { p_event: eventId, p_code: code ?? undefined, p_waitlist: waitlist ?? undefined }),
    waitlistClaim(eventId, waitlist),
    passOnFor(s.org.id),
  ])
  const types = offer
  const codeValid = !!code && !!offer?.some((o) => o.code_applies)
  if (!types?.length) return null
  const t = await getT()
  const now = new Date().getTime()
  const free = types.every((ty) => ty.final_price === 0)
  const soldOut = !claim && types.filter((ty) => !ty.hidden).every((ty) => ty.remaining === 0)
  let anyOnSale = false
  return (
    <section aria-labelledby="tickets" className="site-tickets grid scroll-mt-20 gap-4 rounded-xl border p-4">
      <h2 id="tickets" className="font-heading text-xl font-semibold">
        {free ? t("shop.signupTitle") : t("shop.title")}
      </h2>
      {waitlist && (
        <p className={claim ? "rounded-lg bg-muted px-3 py-2 text-sm" : "text-sm text-destructive"}>
          {claim ? t("waitlist.claimBanner", { count: claim.quantity, until: t.date(claim.offered_until!, { dateStyle: "medium", timeStyle: "short" }) }) : t("waitlist.claimExpired")}
        </p>
      )}
      <form className="flex flex-wrap items-center gap-2">
        <Input name="code" defaultValue={code ?? ""} placeholder={t("shop.codePlaceholder")} aria-label={t("shop.code")} className="w-44 uppercase" />
        <SubmitButton variant="outline" size="sm">
          {t("shop.applyCode")}
        </SubmitButton>
        {code && <span className={codeValid ? "text-sm" : "text-sm text-destructive"}>{codeValid ? t("shop.codeOk") : t("shop.codeInvalid")}</span>}
      </form>
      <form action={sitePath(site, `/e/${slug}/checkout`)} className="grid gap-3">
        {codeValid && <input type="hidden" name="code" value={code!} />}
        {claim && <input type="hidden" name="w" value={waitlist!} />}
        <ul className="grid gap-3">
          {types.map((ty) => {
            const remaining = ty.remaining
            const notYet = ty.sales_start && new Date(ty.sales_start).getTime() > now
            const over = ty.sales_end && new Date(ty.sales_end).getTime() < now
            const typeSoldOut = remaining === 0
            const discounted = ty.final_price !== ty.price
            const onSale = !notYet && !over && !typeSoldOut
            anyOnSale ||= onSale
            return (
              <li key={ty.type_id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {ty.name}
                    {ty.tier_name && <span className="font-normal text-muted-foreground"> · {ty.tier_name}</span>}
                  </p>
                  {ty.description && <p className="text-sm text-muted-foreground">{ty.description}</p>}
                  <p className="text-sm">
                    {discounted && <s className="mr-1 text-muted-foreground">{t.money(ty.price, ty.currency)}</s>}
                    {ty.final_price === 0 ? t("shop.free") : t.money(ty.final_price, ty.currency)}
                    {!onSale && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {typeSoldOut
                          ? t("shop.soldOut")
                          : notYet
                            ? t("shop.from", { date: t.date(ty.sales_start!, { dateStyle: "medium", timeStyle: "short" }) })
                            : t("shop.over")}
                      </span>
                    )}
                    {onSale && remaining != null && remaining <= 20 && <span className="text-muted-foreground"> · {t("shop.left", { count: remaining })}</span>}
                  </p>
                </div>
                {onSale && (
                  <Input
                    type="number"
                    name={`t_${ty.type_id}`}
                    min={0}
                    max={Math.min(max, remaining ?? max)}
                    defaultValue={0}
                    aria-label={t("shop.quantity", { name: ty.name })}
                    className="w-20"
                  />
                )}
              </li>
            )
          })}
        </ul>
        {anyOnSale && !free && fee && (
          <p className="text-xs text-muted-foreground">
            {t("shop.serviceFeeHint", { rate: [fee.percent && `${String(fee.percent).replace(".", ",")} %`, fee.fixedCents && t.money(fee.fixedCents)].filter(Boolean).join(" + ") })}
          </p>
        )}
        {anyOnSale && (
          <SubmitButton className="justify-self-start">
            {t("shop.continue")}
          </SubmitButton>
        )}
      </form>
      {soldOut && (
        <form action={joinWaitlistAction} className="grid gap-3 border-t pt-4">
          <input type="hidden" name="site" value={site} />
          <input type="hidden" name="slug" value={slug} />
          <div className="grid gap-1">
            <h3 className="font-medium">{t("waitlist.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("waitlist.text")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
            <div className="grid gap-1">
              <Label htmlFor="wl-name">{t("waitlist.name")}</Label>
              <Input id="wl-name" name="name" required maxLength={200} autoComplete="name" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="wl-email">{t("waitlist.email")}</Label>
              <Input id="wl-email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="wl-qty">{t("waitlist.quantity")}</Label>
              <Input id="wl-qty" name="quantity" type="number" min={1} max={Math.min(20, max)} defaultValue={1} required />
            </div>
          </div>
          <SubmitButton variant="outline" className="justify-self-start">
            {t("waitlist.join")}
          </SubmitButton>
        </form>
      )}
    </section>
  )
}
