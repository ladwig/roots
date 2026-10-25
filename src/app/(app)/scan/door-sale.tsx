"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BanknoteIcon, CheckCircle2Icon, CreditCardIcon, MinusIcon, PlusIcon, QrCodeIcon, XCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TypedInput } from "@/components/typed-input"
import { useT } from "@/i18n/client"
import { formatMoney, moneyCents } from "@/lib/inputs"
import type { DoorLine, DoorMethod } from "@/tickets/door-fields"
import { doorCancel, doorPay, doorSell, doorStatus, type DoorPay } from "./actions"

type Type = { id: string; name: string; price: number }
type Phase = { kind: "cart" } | { kind: "cash" } | { kind: "waiting"; orderId: string; method: DoorMethod; qr?: string } | { kind: "done"; tickets: number } | { kind: "failed"; orderId: string; error: string }

const ICONS = { cash: BanknoteIcon, qr: QrCodeIcon, terminal: CreditCardIcon }

// Door sale, made for a phone/tablet at the door: tap ticket types (or a free amount), pick how they pay, done.
// Cash asks what was given (change); QR shows the online checkout for the buyer's phone; terminal sends the amount
// to the card reader. Both card ways poll until the provider confirms; paid tickets are let in at once.
export function DoorSale({ eventId, types, methods, left, currency }: { eventId: string; types: Type[]; methods: DoorMethod[]; left: number | null; currency: string }) {
  const t = useT()
  const router = useRouter()
  const [lines, setLines] = useState<DoorLine[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: "cart" })
  const [free, setFree] = useState<{ label: string; amount: string } | null>(null)
  const [buyer, setBuyer] = useState({ name: "", email: "" })
  const [given, setGiven] = useState("")
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const [retryId, setRetryId] = useState<string | null>(null) // cash for an order whose card/QR payment didn't work
  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0)
  const tickets = lines.filter((l) => l.typeId).reduce((n, l) => n + l.quantity, 0)
  const money = (c: number) => t.money(c, currency)

  const add = (l: DoorLine) =>
    setLines((cur) => {
      const i = cur.findIndex((x) => x.typeId === l.typeId && x.label === l.label && x.price === l.price)
      return i < 0 ? [...cur, l] : cur.map((x, j) => (j === i ? { ...x, quantity: Math.min(100, x.quantity + l.quantity) } : x))
    })
  const change = (i: number, d: number) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, quantity: x.quantity + d } : x)).filter((x) => x.quantity > 0))
  const reset = () => {
    setLines([])
    setBuyer({ name: "", email: "" })
    setGiven("")
    setError("")
    setPhase({ kind: "cart" })
    router.refresh() // summary below
  }
  const handle = (r: DoorPay, method: DoorMethod) => {
    if (r.error) {
      if (r.orderId) setPhase({ kind: "failed", orderId: r.orderId, error: r.error })
      else setError(r.error)
      return
    }
    if (r.status === "paid") setPhase({ kind: "done", tickets })
    else setPhase({ kind: "waiting", orderId: r.orderId!, method, qr: r.qr })
  }
  const sell = (method: DoorMethod) => {
    setError("")
    start(async () => handle(await doorSell(eventId, lines, method, buyer), method))
  }
  const retry = (orderId: string, method: DoorMethod) => {
    if (method === "cash") return setPhase({ kind: "cash" }), setRetryId(orderId)
    start(async () => handle(await doorPay(orderId, method), method))
  }
  const payCash = () => {
    setError("")
    start(async () => handle(retryId ? await doorPay(retryId, "cash") : await doorSell(eventId, lines, "cash", buyer), "cash"))
  }

  // Card / QR: ask every 2 s until the provider says paid or failed.
  useEffect(() => {
    if (phase.kind !== "waiting") return
    const id = setInterval(async () => {
      const s = await doorStatus(phase.orderId).catch(() => null)
      if (s === "paid") setPhase({ kind: "done", tickets })
      else if (s && s !== "open") setPhase({ kind: "failed", orderId: phase.orderId, error: t("door.sale.notPaid") })
    }, 2000)
    return () => clearInterval(id)
  }, [phase, tickets, t])

  if (phase.kind === "done")
    return (
      <div className="grid justify-items-center gap-4 rounded-xl border p-8 text-center">
        <CheckCircle2Icon className="size-16 text-primary" />
        <p className="text-2xl font-semibold">{t("door.sale.paid")}</p>
        {phase.tickets > 0 && <p className="text-muted-foreground">{t("door.sale.letIn", { count: phase.tickets })}</p>}
        <Button size="lg" className="h-14 w-full max-w-sm text-base" onClick={reset} autoFocus>
          {t("door.sale.next")}
        </Button>
      </div>
    )

  if (phase.kind === "waiting")
    return (
      <div className="grid justify-items-center gap-4 rounded-xl border p-6 text-center">
        <p className="text-3xl font-semibold tabular-nums">{money(total)}</p>
        {phase.qr ? (
          <>
            <div className="w-full max-w-xs rounded-lg bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: phase.qr }} />
            <p className="text-muted-foreground">{t("door.sale.scanToPay")}</p>
          </>
        ) : (
          <>
            <CreditCardIcon className="size-16 animate-pulse text-primary" />
            <p className="text-muted-foreground">{t("door.sale.onTerminal")}</p>
          </>
        )}
        <p className="text-sm text-muted-foreground">{t("door.sale.waiting")}</p>
        <div className="grid w-full max-w-sm gap-2">
          {methods.includes("cash") && (
            <Button variant="outline" size="lg" className="h-12" disabled={pending} onClick={() => retry(phase.orderId, "cash")}>
              <BanknoteIcon /> {t("door.sale.switchCash")}
            </Button>
          )}
          <Button variant="ghost" size="lg" className="h-12" disabled={pending} onClick={() => start(async () => (await doorCancel(phase.orderId), setPhase({ kind: "cart" })))}>
            {t("door.sale.cancel")}
          </Button>
        </div>
      </div>
    )

  if (phase.kind === "failed")
    return (
      <div className="grid justify-items-center gap-4 rounded-xl border p-6 text-center">
        <XCircleIcon className="size-14 text-destructive" />
        <p className="font-medium">{phase.error}</p>
        <div className="grid w-full max-w-sm gap-2">
          {methods.map((m) => {
            const Icon = ICONS[m]
            return (
              <Button key={m} size="lg" variant="outline" className="h-12" disabled={pending} onClick={() => retry(phase.orderId, m)}>
                <Icon /> {t.dynamic(`door.sale.method.${m}`)}
              </Button>
            )
          })}
          <Button variant="ghost" size="lg" className="h-12" disabled={pending} onClick={() => start(async () => (await doorCancel(phase.orderId), setPhase({ kind: "cart" })))}>
            {t("door.sale.cancel")}
          </Button>
        </div>
      </div>
    )

  if (phase.kind === "cash") {
    const g = moneyCents(given)
    const back = g !== null ? g - total : null
    const quick = [...new Set([total, ...[500, 1000, 2000, 5000, 10000].map((n) => Math.ceil(total / n) * n)])].filter((n) => n >= total).slice(0, 4)
    return (
      <div className="grid gap-4 rounded-xl border p-5">
        <p className="text-center text-3xl font-semibold tabular-nums">{money(total)}</p>
        <div className="grid gap-2">
          <Label htmlFor="door-given">{t("door.sale.given")}</Label>
          <div className="grid grid-cols-4 gap-2">
            {quick.map((n) => (
              <Button key={n} variant="outline" className="h-12 tabular-nums" onClick={() => setGiven(formatMoney(n))}>
                {money(n)}
              </Button>
            ))}
          </div>
          <TypedInput kind="money" id="door-given" value={given} onChange={(e) => setGiven(e.target.value)} className="h-12 text-lg" />
        </div>
        {back !== null && back >= 0 && <p className="text-center text-xl">{t("door.sale.change", { amount: money(back) })}</p>}
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Button size="lg" className="h-14 text-base" disabled={pending} onClick={payCash}>
          <BanknoteIcon /> {pending ? t("door.sale.booking") : t("door.sale.cashReceived")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => (retryId ? start(async () => (await doorCancel(retryId), setRetryId(null), setPhase({ kind: "cart" }))) : setPhase({ kind: "cart" }))}>
          {t("common.cancel")}
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {types.map((ty) => (
          <button
            key={ty.id}
            type="button"
            onClick={() => add({ typeId: ty.id, label: "", price: ty.price, quantity: 1 })}
            className="grid min-h-20 content-center gap-1 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted active:scale-[0.98]"
          >
            <span className="line-clamp-2 font-medium">{ty.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{money(ty.price)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFree({ label: "", amount: "" })}
          className="grid min-h-20 content-center justify-items-start gap-1 rounded-xl border border-dashed p-3 text-left text-muted-foreground transition-colors hover:bg-muted"
        >
          <PlusIcon className="size-4" />
          <span className="font-medium">{t("door.sale.freeAmount")}</span>
        </button>
      </div>

      {free && (
        <form
          className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            const c = moneyCents(free.amount)
            if (!free.label.trim() || c === null) return
            add({ typeId: null, label: free.label.trim(), price: c, quantity: 1 })
            setFree(null)
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="door-free-label">{t("door.sale.what")}</Label>
            <Input id="door-free-label" value={free.label} onChange={(e) => setFree({ ...free, label: e.target.value })} placeholder={t("door.sale.whatPlaceholder")} autoFocus className="h-11" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="door-free-amount">{t("door.sale.amount")}</Label>
            <TypedInput kind="money" id="door-free-amount" value={free.amount} onChange={(e) => setFree({ ...free, amount: e.target.value })} className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11">{t("door.sale.add")}</Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setFree(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      )}

      {lines.length > 0 && (
        <ul className="grid divide-y rounded-xl border">
          {lines.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 p-2 pl-3">
              <span className="min-w-0 flex-1 truncate font-medium">{l.typeId ? types.find((x) => x.id === l.typeId)?.name : l.label}</span>
              {editing === i ? (
                <TypedInput
                  kind="money"
                  autoFocus
                  aria-label={t("door.sale.price")}
                  defaultValue={formatMoney(l.price)}
                  className="h-10 w-28"
                  onBlur={(e) => {
                    const c = moneyCents(e.target.value)
                    if (c !== null) setLines((cur) => cur.map((x, j) => (j === i ? { ...x, price: c } : x)))
                    setEditing(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <button type="button" onClick={() => setEditing(i)} className="rounded-md px-2 py-1 text-sm tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted" aria-label={t("door.sale.editPrice")}>
                  {money(l.price)}
                </button>
              )}
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-10" aria-label={t("door.sale.less")} onClick={() => change(i, -1)}>
                  <MinusIcon />
                </Button>
                <span className="w-8 text-center font-medium tabular-nums">{l.quantity}</span>
                <Button size="icon" variant="outline" className="size-10" aria-label={t("door.sale.more")} onClick={() => change(i, 1)}>
                  <PlusIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <>
          <details className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("door.sale.buyer")}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="door-name">{t("door.sale.name")}</Label>
                <Input id="door-name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} className="h-11" autoComplete="off" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="door-email">{t("door.sale.email")}</Label>
                <TypedInput kind="email" id="door-email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} className="h-11" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("door.sale.buyerHint")}</p>
          </details>
          {left !== null && tickets > 0 && (
            <p className={tickets > left ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
              {tickets > left ? t("door.sale.overCapacity", { left }) : t("door.sale.seatsLeft", { left })}
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("door.sale.total")}</span>
            <span className="text-3xl font-semibold tabular-nums">{money(total)}</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {methods.length ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {methods.map((m) => {
                const Icon = ICONS[m]
                return (
                  <Button key={m} size="lg" className="h-14 text-base" variant={m === methods[0] ? "default" : "outline"} disabled={pending} onClick={() => (m === "cash" ? (setRetryId(null), setPhase({ kind: "cash" })) : sell(m))}>
                    <Icon /> {pending ? t("door.sale.booking") : t.dynamic(`door.sale.method.${m}`)}
                  </Button>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("door.sale.noMethods")}</p>
          )}
        </>
      )}
    </div>
  )
}
