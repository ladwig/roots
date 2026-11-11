"use client"

import { useState } from "react"
import { DateInput } from "@/components/date-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"
import { monthsOf, termEndOf } from "@/rentals/fields"

type Mode = "open" | "fixed"

/**
 * A long-term contract's term the way people think about it: start, then open-ended or a term of N months (the end
 * date follows), and after that term it ends or renews by M months; notice period in months. Posts the stored shape:
 * starts_at, ends_at (last day of the first term, or empty), renew_months, notice_months.
 */
export function TermFields({ start, end, renew, notice, termMonths, disabled }: { start: string; end: string | null; renew: number | null; notice: number | null; termMonths?: number | null; disabled?: boolean }) {
  const t = useT()
  const [from, setFrom] = useState(start)
  const [mode, setMode] = useState<Mode>(end || termMonths ? "fixed" : "open")
  const [months, setMonths] = useState(String((end && monthsOf(start, end)) || termMonths || 12))
  const [after, setAfter] = useState<"end" | "renew">(renew || (!end && termMonths) ? "renew" : "end")
  const [renewBy, setRenewBy] = useState(String(renew ?? 12))
  const n = Number(months)
  const until = mode === "fixed" && /^\d{4}-\d{2}-\d{2}$/.test(from) && Number.isInteger(n) && n > 0 && n <= 600 ? termEndOf(from, n) : ""
  const day = (d: string) => t.date(`${d}T12:00:00Z`, { dateStyle: "medium" })
  const segment = <V extends string>(name: string, value: V, current: V, set: (v: V) => void, label: string) => (
    <label className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-checked:bg-background has-checked:shadow-sm has-disabled:cursor-default">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => set(value)} disabled={disabled} className="sr-only" />
      {label}
    </label>
  )

  return (
    <div className="grid gap-4">
      <input type="hidden" name="ends_at" value={until} />
      <input type="hidden" name="renew_months" value={mode === "fixed" && after === "renew" ? renewBy : ""} />
      <div className="grid content-start gap-2 sm:max-w-60">
        <Label htmlFor="term-start">{t("rentals.starts")}</Label>
        <DateInput id="term-start" name="starts_at" type="date" required defaultValue={start} onValueChange={setFrom} disabled={disabled} />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{t("rentals.termLabel")}</span>
        <div role="radiogroup" aria-label={t("rentals.termLabel")} className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
          {segment("term_mode", "open", mode, setMode, t("rentals.termOpen"))}
          {segment("term_mode", "fixed", mode, setMode, t("rentals.termFixed"))}
        </div>
        {mode === "fixed" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input aria-label={t("rentals.termMonths")} type="number" inputMode="numeric" min={1} max={600} value={months} onChange={(e) => setMonths(e.target.value)} disabled={disabled} className="w-20" />
            <span>{t("rentals.monthsWord")}</span>
            {until && <span className="text-muted-foreground">· {t("rentals.termUntil", { date: day(until) })}</span>}
          </div>
        )}
      </div>
      {mode === "fixed" && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t("rentals.afterLabel")}</span>
          <div role="radiogroup" aria-label={t("rentals.afterLabel")} className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
            {segment("term_after", "end", after, setAfter, t("rentals.afterEnd"))}
            {segment("term_after", "renew", after, setAfter, t("rentals.afterRenew"))}
          </div>
          {after === "renew" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t("rentals.renewBy")}</span>
              <Input aria-label={t("rentals.renew")} type="number" inputMode="numeric" min={1} max={600} value={renewBy} onChange={(e) => setRenewBy(e.target.value)} disabled={disabled} className="w-20" />
              <span>{t("rentals.monthsWord")}</span>
            </div>
          )}
        </div>
      )}
      {(mode === "open" || after === "renew") && (
        <div className="grid gap-2">
          <Label htmlFor="term-notice">{t("rentals.notice")}</Label>
          <div className="flex items-center gap-2 text-sm">
            <Input id="term-notice" name="notice_months" type="number" inputMode="numeric" min={0} max={60} defaultValue={notice ?? 3} disabled={disabled} className="w-20" />
            <span>{t(mode === "open" ? "rentals.noticeOpenHint" : "rentals.noticeRenewHint")}</span>
          </div>
        </div>
      )}
    </div>
  )
}
