import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import { previewNumber, RANGE_KINDS, type RangeKind } from "@/lib/number-ranges"

type Range = { format: string; next_number: number; yearly_reset: boolean } | null | undefined

// One number range (invoice, quote, member…): format with placeholders, next number, yearly reset, preview.
// The module's server action saves it (permission of that module).
export function NumberRangeForm({ t, kind, range, label, action }: { t: T; kind: RangeKind; range: Range; label: string; action: (fd: FormData) => Promise<void> }) {
  const format = range?.format ?? RANGE_KINDS[kind].fallback
  const next = range?.next_number ?? 1
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={`n-${kind}`}>{label}</Label>
          <Input id={`n-${kind}`} name="format" defaultValue={format} required maxLength={60} className="font-mono" aria-describedby={`n-${kind}-help`} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`nn-${kind}`}>{t("numbers.next")}</Label>
          <Input id={`nn-${kind}`} name="next_number" type="number" min={1} defaultValue={next} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="yearly_reset" value="1" defaultChecked={range?.yearly_reset ?? RANGE_KINDS[kind].yearlyReset} className="size-4" />
          {t("numbers.yearlyReset")}
        </label>
        <SubmitButton variant="outline" size="sm">
          {t("common.save")}
        </SubmitButton>
      </div>
      <p id={`n-${kind}-help`} className="text-xs text-muted-foreground">
        {t("numbers.preview", { example: previewNumber(format, next, new Date().toISOString().slice(0, 10), "1990-01-01") })} · {t("numbers.help")}
      </p>
    </form>
  )
}
