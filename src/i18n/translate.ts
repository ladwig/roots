// Pure translation core (no Next/React imports) so it runs on server, client and in `node --test`.
import type { Locale, Messages } from "./config"

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { other: string }
      ? `${P}${K}` // plural group: pass { count }
      : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type MessageKey = Leaves<Messages>
export type Vars = Record<string, string | number>

export type T = {
  (key: MessageKey, vars?: Vars): string
  /** For keys built at runtime (module/permission keys). Falls back to the key itself. */
  dynamic(key: string, vars?: Vars): string
  has(key: string): boolean
  list(items: string[]): string
  date(value: string | Date, options?: Intl.DateTimeFormatOptions): string
  /** Stored multi-language value ({"de": "…", "en": "…"}) in the current language, falling back to German. */
  pick(value: unknown): string
  locale: Locale
}

const intl: Record<Locale, string> = { de: "de-DE", en: "en-GB" }

// Keys may contain dots themselves ("permissions.org.settings.manage"), so try the longest segment first.
function lookup(obj: unknown, parts: string[]): unknown {
  if (!parts.length) return obj
  if (!obj || typeof obj !== "object") return undefined
  for (let i = parts.length; i >= 1; i--) {
    const k = parts.slice(0, i).join(".")
    if (k in obj) {
      const found = lookup((obj as Record<string, unknown>)[k], parts.slice(i))
      if (found !== undefined) return found
    }
  }
  return undefined
}

export function createT(locale: Locale, dict: Messages): T {
  const plural = new Intl.PluralRules(intl[locale])
  const translate = (key: string, vars?: Vars) => {
    let value = lookup(dict, key.split("."))
    if (value && typeof value === "object") {
      const forms = value as Record<string, string>
      value = forms[plural.select(Number(vars?.count ?? 0))] ?? forms.other
    }
    if (typeof value !== "string") return key
    return vars ? value.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : value
  }
  const t = translate as T
  t.dynamic = translate
  t.has = (key) => lookup(dict, key.split(".")) !== undefined
  t.list = (items) => new Intl.ListFormat(intl[locale], { type: "conjunction" }).format(items)
  t.date = (value, options = { dateStyle: "medium" }) => new Date(value).toLocaleString(intl[locale], options)
  t.pick = (value) => {
    if (typeof value === "string") return value
    const v = (value ?? {}) as Record<string, unknown>
    return String(v[locale] ?? v.de ?? Object.values(v)[0] ?? "")
  }
  t.locale = locale
  return t
}

type DbError = { code?: string; message?: string; details?: string } | null | undefined

// Database functions raise short codes ("last_owner"); translate them, hide anything unexpected.
export function dbError(t: T, error: DbError) {
  if (error?.message && t.has(`errors.${error.message}`)) return t.dynamic(`errors.${error.message}`, { detail: error.details ?? "" })
  if (error?.code === "42501") return t("errors.not_allowed")
  if (error) console.error(error)
  return t("errors.generic")
}

export function authError(t: T, error: { code?: string } | null | undefined) {
  const key = `errors.auth.${error?.code}`
  return t.has(key) ? t.dynamic(key) : t("errors.auth.generic")
}
