import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { getSite } from "../../data"

// Ticket types with quantity fields; a plain GET form to the checkout step (works without JS).
export async function TicketShop({ site, slug, eventId, max }: { site: string; slug: string; eventId: string; max: number }) {
  const s = (await getSite(site))!
  const [{ data: types }, { data: avail }] = await Promise.all([
    s.db.from("ticket_types").select("id, name, description, price, currency, sales_start, sales_end").eq("event_id", eventId).order("position").order("price"),
    s.db.rpc("ticket_availability", { p_event: eventId }),
  ])
  if (!types?.length) return null
  const t = await getT()
  const now = new Date().getTime()
  const left = new Map(avail?.map((a) => [a.type_id, a.remaining]))
  let anyOnSale = false
  return (
    <section aria-labelledby="tickets" className="grid gap-4 rounded-xl border p-4">
      <h2 id="tickets" className="font-heading text-xl font-semibold">
        {t("shop.title")}
      </h2>
      <form action={sitePath(site, `/e/${slug}/checkout`)} className="grid gap-3">
        <ul className="grid gap-3">
          {types.map((ty) => {
            const remaining = left.get(ty.id)
            const notYet = ty.sales_start && new Date(ty.sales_start).getTime() > now
            const over = ty.sales_end && new Date(ty.sales_end).getTime() < now
            const soldOut = remaining === 0
            const onSale = !notYet && !over && !soldOut
            anyOnSale ||= onSale
            return (
              <li key={ty.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{ty.name}</p>
                  {ty.description && <p className="text-sm text-muted-foreground">{ty.description}</p>}
                  <p className="text-sm">
                    {ty.price === 0 ? t("shop.free") : t.money(ty.price, ty.currency)}
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
                    name={`t_${ty.id}`}
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
          <Button type="submit" className="justify-self-start">
            {t("shop.continue")}
          </Button>
        )}
      </form>
    </section>
  )
}
