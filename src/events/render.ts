import { isLocale, messages, type Locale } from "@/i18n/config"
import { createT } from "@/i18n/translate"
import { getEventType } from "./registry"

type EventLike = { type: string; payload: unknown }

/** An event as one line of text + link, in the recipient's language. Used by every channel. */
export function renderEvent(event: EventLike, locale: string | null | undefined) {
  const lang: Locale = isLocale(locale) ? locale : "de"
  const t = createT(lang, messages[lang])
  const p = (event.payload ?? {}) as Record<string, unknown>
  const vars: Record<string, string> = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v ?? "")]))
  if (typeof p.amount === "number") vars.amount = t.money(p.amount, String(p.currency ?? "eur"))
  vars.who = String(p.customer_email || p.email || p.name || "–")
  return {
    title: t.has(`events.messages.${event.type}`) ? t.dynamic(`events.messages.${event.type}`, vars) : event.type,
    label: t.has(`events.types.${event.type}`) ? t.dynamic(`events.types.${event.type}`) : event.type,
    href: getEventType(event.type)?.href?.(p),
  }
}
