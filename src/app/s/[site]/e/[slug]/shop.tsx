import { Input } from "@/components/ui/input"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { getSite } from "../../data"
import { SubmitButton } from "@/components/submit-button"

// Ticket types with quantity fields; a plain GET form to the checkout step (works without JS).
export async function TicketShop({ site, slug, eventId, max, code }: { site: string; slug: string; eventId: string; max: number; code: string | null }) {
  const s = (await getSite(site))!
  const { data: offer } = await s.db.rpc("ticket_offer", { p_event: eventId, p_code: code ?? undefined })
  const types = offer
  const codeValid = !!code && !!offer?.some((o) => o.code_applies)
  if (!types?.length) return null
  const t = await getT()
  const now = new Date().getTime()
  let anyOnSale = false
  return (
    <section aria-labelledby="tickets" className="grid gap-4 rounded-xl border p-4">
      <h2 id="tickets" className="font-heading text-xl font-semibold">
        {t("shop.title")}
      </h2>
      <form className="flex flex-wrap items-center gap-2">
        <Input name="code" defaultValue={code ?? ""} placeholder={t("shop.codePlaceholder")} aria-label={t("shop.code")} className="w-44 uppercase" />
        <SubmitButton variant="outline" size="sm">
          {t("shop.applyCode")}
        </SubmitButton>
        {code && <span className={codeValid ? "text-sm" : "text-sm text-destructive"}>{codeValid ? t("shop.codeOk") : t("shop.codeInvalid")}</span>}
      </form>
      <form action={sitePath(site, `/e/${slug}/checkout`)} className="grid gap-3">
        {codeValid && <input type="hidden" name="code" value={code!} />}
        <ul className="grid gap-3">
          {types.map((ty) => {
            const remaining = ty.remaining
            const notYet = ty.sales_start && new Date(ty.sales_start).getTime() > now
            const over = ty.sales_end && new Date(ty.sales_end).getTime() < now
            const soldOut = remaining === 0
            const discounted = ty.final_price !== ty.price
            const onSale = !notYet && !over && !soldOut
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
                        {soldOut
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
        {anyOnSale && (
          <SubmitButton className="justify-self-start">
            {t("shop.continue")}
          </SubmitButton>
        )}
      </form>
    </section>
  )
}
