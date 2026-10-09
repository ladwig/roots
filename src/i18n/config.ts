import de from "./messages/de.json"
import en from "./messages/en.json"

export const locales = ["de", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "de"
export const localeNames: Record<Locale, string> = { de: "Deutsch", en: "English" }

// de.json is the source of truth; this assignment fails to type-check if en.json is missing a key.
export type Messages = typeof de
export const messages: Record<Locale, Messages> = { de, en }

export const isLocale = (v: unknown): v is Locale => locales.includes(v as Locale)
