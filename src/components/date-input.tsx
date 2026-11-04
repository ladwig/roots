"use client"

import { useRef, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { de, enUS } from "react-day-picker/locale"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"
import { formatDate, parseDate, parseTime } from "@/lib/date-input"
import { cn } from "@/lib/utils"

type Props = {
  name?: string
  id?: string
  type?: "date" | "datetime-local"
  defaultValue?: string
  onValueChange?: (value: string) => void // native format ("2026-11-04" / "2026-11-04T19:30"); remount with `key` to reset
  required?: boolean
  disabled?: boolean
  min?: string
  className?: string
  "aria-label"?: string
}

/**
 * Date (+ time) the German / EU way in every browser: "TT.MM.JJJJ" typed or picked in a calendar (Monday first) and
 * 24-hour "HH:MM". Native date inputs follow the browser's language (MM/DD, AM/PM in an English Chrome), so roots
 * uses this instead. Posts `name` in the native format, so actions keep parsing what they did.
 */
export function DateInput({ name, id, type = "date", defaultValue, onValueChange, required, disabled, min, className, ...rest }: Props) {
  const t = useT()
  const withTime = type === "datetime-local"
  const initial = defaultValue ?? ""
  const [date, setDate] = useState(initial.slice(0, 10))
  const [time, setTime] = useState(withTime ? initial.slice(11, 16) : "")
  const [dateText, setDateText] = useState(formatDate(initial))
  const [timeText, setTimeText] = useState(time)
  const [open, setOpen] = useState(false)
  const hidden = useRef<HTMLInputElement>(null)
  const posted = date && (!withTime || time) ? (withTime ? `${date}T${time}` : date) : ""

  const commit = (d: string, tm: string) => {
    setDate(d)
    setTime(tm)
    const next = d && (!withTime || tm) ? (withTime ? `${d}T${tm}` : d) : ""
    onValueChange?.(next)
    // Tell the form (save bar, auto-save) something changed: the hidden input changes without an input event.
    requestAnimationFrame(() => hidden.current?.dispatchEvent(new Event("input", { bubbles: true })))
  }

  const tooEarly = !!(min && date && date < min.slice(0, 10))
  return (
    <div className={cn("flex max-w-64 items-center gap-1.5", className)}>
      {name && <input ref={hidden} type="hidden" name={name} value={posted} />}
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          inputMode="numeric"
          placeholder={t("inputs.datePlaceholder")}
          value={dateText}
          required={required}
          disabled={disabled}
          aria-invalid={tooEarly || undefined}
          aria-label={rest["aria-label"]}
          autoComplete="off"
          onChange={(e) => setDateText(e.target.value)}
          onBlur={() => {
            if (!dateText.trim()) return commit("", time)
            const d = parseDate(dateText)
            if (!d) return setDateText(formatDate(date))
            setDateText(formatDate(d))
            commit(d, withTime && !time ? "00:00" : time)
          }}
          className="pr-9 tabular-nums"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<button type="button" />}
            disabled={disabled}
            aria-label={t("inputs.pickDate")}
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CalendarIcon className="size-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              locale={t.locale === "de" ? de : enUS}
              weekStartsOn={1}
              selected={date ? new Date(`${date}T12:00:00`) : undefined}
              defaultMonth={date ? new Date(`${date}T12:00:00`) : undefined}
              disabled={min ? { before: new Date(`${min.slice(0, 10)}T00:00:00`) } : undefined}
              onSelect={(d) => {
                if (!d) return
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                setDateText(formatDate(iso))
                commit(iso, withTime && !time ? "00:00" : time)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {withTime && (
        <Input
          inputMode="numeric"
          placeholder="HH:MM"
          value={timeText}
          required={required}
          disabled={disabled}
          aria-label={t("inputs.time")}
          autoComplete="off"
          onChange={(e) => setTimeText(e.target.value)}
          onBlur={() => {
            const tm = parseTime(timeText)
            if (!tm) return setTimeText(time)
            setTimeText(tm)
            commit(date, tm)
          }}
          className="w-20 text-center tabular-nums"
        />
      )}
    </div>
  )
}
