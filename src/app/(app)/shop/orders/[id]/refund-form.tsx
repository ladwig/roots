"use client"

import { useState } from "react"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { moneyCents } from "@/lib/inputs"
import { refundOrderAction } from "../../actions"

type Item = { id: string; description: string; left: number; unit: number }

/**
 * Refund drawer: pick pieces per line (the amount follows), or switch to another amount (goodwill, a deduction for a
 * returned item). The button always says how much goes back; the server checks everything again (readRefund).
 */
export function RefundForm({ orderId, items, left, currency, manual }: { orderId: string; items: Item[]; left: number; currency: string; manual: boolean }) {
  const t = useT()
  const [qty, setQty] = useState<Record<string, number>>({})
  const [other, setOther] = useState(false)
  const [amountText, setAmountText] = useState("")
  const fromItems = items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.unit, 0)
  const amount = other ? (moneyCents(amountText) ?? 0) : fromItems
  const all = () => setQty(Object.fromEntries(items.map((i) => [i.id, i.left])))

  return (
    <form action={refundOrderAction} className="grid gap-5">
      <input type="hidden" name="id" value={orderId} />
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>{t("store.refundItems")}</Label>
          <button type="button" onClick={all} className="text-sm text-primary underline-offset-4 hover:underline">
            {t("store.refundAll")}
          </button>
        </div>
        <ul className="grid divide-y rounded-lg border text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{i.description}</span>
                <span className="text-xs text-muted-foreground">
                  {t.money(i.unit, currency)} · {t("store.refundLeft", { count: i.left })}
                </span>
              </span>
              <Input
                type="number"
                name={`q_${i.id}`}
                min={0}
                max={i.left}
                value={qty[i.id] ?? 0}
                disabled={!i.left}
                onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(i.left, Number(e.target.value) || 0)) })}
                aria-label={t("store.refundQty", { item: i.description })}
                className="w-16"
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("store.refundItemsHint")}</p>
      </div>

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="other" value="1" checked={other} onChange={(e) => (setOther(e.target.checked), !amountText && setAmountText(fromItems ? (fromItems / 100).toFixed(2).replace(".", ",") : ""))} className="size-4 accent-primary" />
          {t("store.refundOther")}
        </label>
        {other && <TypedInput kind="money" name="amount" defaultValue={amountText} onChange={(e) => setAmountText(e.currentTarget.value)} aria-label={t("store.refundAmount")} />}
        <p className="text-xs text-muted-foreground">{t("store.refundOtherHint", { left: t.money(left, currency) })}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="refund-reason">{t("store.refundReasonLabel")}</Label>
        <Textarea id="refund-reason" name="reason" maxLength={500} rows={2} placeholder={t("store.refundReasonPlaceholder")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" value="1" defaultChecked className="size-4 accent-primary" />
        {t("store.refundNotify")}
      </label>

      <p className="text-sm text-muted-foreground">{manual ? t("store.refundManualHint") : t("store.refundOnlineHint")}</p>
      <SubmitButton disabled={amount <= 0 || amount > left} data-confirm="store.confirmRefund" className="justify-self-start">
        {amount > 0 ? t("store.refundButton", { amount: t.money(amount, currency) }) : t("store.refundChoose")}
      </SubmitButton>
    </form>
  )
}
