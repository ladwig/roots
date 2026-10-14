"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { useT } from "@/i18n/client"
import { bicValid, formatIban, formatMoney, ibanValid, moneyCents, phoneValid, postcodeValid } from "@/lib/inputs"
import { cn } from "@/lib/utils"

export type InputKind = "iban" | "bic" | "postcode" | "phone" | "email" | "url" | "money" | "number" | "date"

type Spec = { type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoComplete?: string; maxLength?: number; width: string; check?: (v: string, country?: string | null) => boolean; format?: (v: string) => string }

// One place for every kind of value: keyboard on phones, browser autofill, width that fits the value, the
// placeholder (inputs.placeholder.<kind>) and the check (inputs.invalid.<kind>). The server checks again.
const SPECS: Record<InputKind, Spec> = {
  iban: { autoComplete: "off", maxLength: 42, width: "sm:max-w-80", check: ibanValid, format: formatIban },
  bic: { autoComplete: "off", maxLength: 14, width: "sm:max-w-44", check: bicValid, format: (v) => v.toUpperCase().replace(/\s/g, "") },
  postcode: { inputMode: "text", autoComplete: "postal-code", maxLength: 10, width: "max-w-32", check: postcodeValid, format: (v) => v.trim().toUpperCase() },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 50, width: "sm:max-w-64", check: phoneValid, format: (v) => v.trim().replace(/\s+/g, " ") },
  email: { type: "email", inputMode: "email", autoComplete: "email", maxLength: 320, width: "", format: (v) => v.trim().toLowerCase() },
  url: { type: "url", inputMode: "url", autoComplete: "url", maxLength: 2000, width: "" },
  money: { inputMode: "decimal", autoComplete: "off", maxLength: 16, width: "max-w-40", check: (v) => moneyCents(v) !== null, format: (v) => (moneyCents(v) === null ? v : formatMoney(moneyCents(v)!)) },
  number: { type: "number", inputMode: "decimal", width: "max-w-32" },
  date: { type: "date", width: "max-w-44" },
}

/**
 * An input that knows its kind: `<TypedInput kind="iban" name="iban" />`. Formats on leaving the field (IBAN in
 * groups of four, 12,5 → 12,50), marks wrong values and blocks submitting them (custom validity), shows why.
 * `country` narrows the postcode check (DE = five digits). Money posts German text ("1.234,50"): parse with moneyCents().
 */
export function TypedInput({ kind, country, className, onBlur, onChange, defaultValue, ...props }: { kind: InputKind; country?: string | null } & Omit<React.ComponentProps<"input">, "type">) {
  const t = useT()
  const spec = SPECS[kind]
  const [error, setError] = useState(false)
  const placeholder = props.placeholder ?? (["number", "date"].includes(kind) ? undefined : t.dynamic(`inputs.placeholder.${kind}`))
  const message = t.dynamic(`inputs.invalid.${kind}`)
  const validate = (el: HTMLInputElement) => {
    const bad = !!el.value.trim() && !!spec.check && !spec.check(el.value, country)
    el.setCustomValidity(bad ? message : "")
    return bad
  }
  const initial = typeof defaultValue === "string" && spec.format && defaultValue ? spec.format(defaultValue) : defaultValue
  const common = {
    ...props,
    type: spec.type ?? "text",
    inputMode: spec.inputMode,
    autoComplete: props.autoComplete ?? spec.autoComplete,
    maxLength: props.maxLength ?? spec.maxLength,
    placeholder,
    defaultValue: initial,
    "aria-invalid": error || undefined,
    "aria-describedby": error && props.id ? `${props.id}-err` : props["aria-describedby"],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Re-check silently while typing (so submit is blocked), show the message only once they left the field.
      const bad = validate(e.currentTarget)
      if (!bad) setError(false)
      onChange?.(e)
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (spec.format && e.currentTarget.value.trim()) e.currentTarget.value = spec.format(e.currentTarget.value)
      setError(validate(e.currentTarget))
      onBlur?.(e)
    },
  }
  return (
    <>
      {kind === "money" ? (
        <InputGroup className={cn(spec.width, className)}>
          <InputGroupInput {...common} className="text-right tabular-nums" />
          <InputGroupAddon align="inline-end">€</InputGroupAddon>
        </InputGroup>
      ) : (
        <Input {...common} className={cn(spec.width, ["iban", "bic", "postcode"].includes(kind) && "font-mono tracking-wide", className)} />
      )}
      {error && (
        <p id={props.id ? `${props.id}-err` : undefined} className="text-xs text-destructive">
          {message}
        </p>
      )}
    </>
  )
}
