import Link from "next/link"
import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { param, sitePath } from "@/lib/url"
import { getSite } from "../../../data"
import { buy } from "./actions"
import { SubmitButton } from "@/components/submit-button"

// Step 2: who buys + names per ticket (if the event asks), then off to the payment page.
export default async function Checkout({ params, searchParams }: PageProps<"/s/[site]/e/[slug]/checkout">) {
  const { site, slug } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const { data: ev } = await s.db
    .from("events")
    .select("id, title, starts_at, ticket_names, max_tickets_per_order")
    .eq("org_id", s.org.id)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()
  if (!ev) notFound()
  const t = await getT()
  const code = param(sp, "code")?.trim().toUpperCase().slice(0, 40) || null
  const { data: offer } = await s.db.rpc("ticket_offer", { p_event: ev.id, p_code: code ?? undefined })
  const types = offer?.map((o) => ({ id: o.type_id, name: o.tier_name ? `${o.name} · ${o.tier_name}` : o.name, price: o.final_price, currency: o.currency }))
  // One entry per ticket, from ?t_<typeId>=<qty>
  const picked = (types ?? []).flatMap((ty) => {
    const n = Math.max(0, Math.min(ev.max_tickets_per_order, Math.floor(Number(param(sp, `t_${ty.id}`)) || 0)))
    return Array.from({ length: n }, () => ty)
  })
  const back = sitePath(site, `/e/${slug}`)
  const total = picked.reduce((sum, ty) => sum + ty.price, 0)

  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-12">
      <Link href={back} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {ev.title}
      </Link>
      <h1 className="font-heading text-2xl font-semibold">{t("shop.checkoutTitle")}</h1>
      <Notice error={param(sp, "error")} />
      {!picked.length ? (
        <p className="text-sm text-muted-foreground">
          {t("shop.nothing")}{" "}
          <Link href={back} className="underline underline-offset-4">
            {t("shop.backToEvent")}
          </Link>
        </p>
      ) : picked.length > ev.max_tickets_per_order ? (
        <p className="text-sm">{t("shop.tooMany", { max: ev.max_tickets_per_order })}</p>
      ) : (
        <form action={buy} className="grid gap-6">
          <input type="hidden" name="site" value={site} />
          <input type="hidden" name="slug" value={slug} />
          {code && <input type="hidden" name="code" value={code} />}
          <ol className="grid gap-3">
            {picked.map((ty, i) => (
              <li key={i} className="grid gap-2 rounded-lg border p-3">
                <input type="hidden" name="type" value={ty.id} />
                <p className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {t("shop.ticketN", { n: i + 1 })} · {ty.name}
                  </span>
                  <span>{ty.price === 0 ? t("shop.free") : t.money(ty.price, ty.currency)}</span>
                </p>
                {ev.ticket_names !== "off" && (
                  <div className="grid gap-1">
                    <Label htmlFor={`holder-${i}`}>
                      {t(ev.ticket_names === "required" ? "shop.holder" : "shop.holderOptional")}
                    </Label>
                    <Input id={`holder-${i}`} name="holder" required={ev.ticket_names === "required"} maxLength={200} autoComplete="off" />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="flex justify-between font-medium">
            <span>{t("shop.total")}</span>
            <span>{total === 0 ? t("shop.free") : t.money(total, picked[0].currency)}</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="buyer-name">{t("shop.name")}</Label>
              <Input id="buyer-name" name="name" required maxLength={200} autoComplete="name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="buyer-email">{t("shop.email")}</Label>
              <Input id="buyer-email" name="email" type="email" required autoComplete="email" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("shop.emailHint")}</p>
          <SubmitButton className="justify-self-start">
            {total === 0 ? t("shop.getFree") : t("shop.pay", { amount: t.money(total, picked[0].currency) })}
          </SubmitButton>
        </form>
      )}
    </main>
  )
}

export const instant = false
