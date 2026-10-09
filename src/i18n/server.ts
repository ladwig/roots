import { cache } from "react"
import { cookies, headers } from "next/headers"
import { defaultLocale, isLocale, messages, type Locale } from "./config"
import { createT } from "./translate"

export const LOCALE_COOKIE = "locale"

// Cookie (choice on this device) → browser language → German. The choice is also saved on the profile
// (profiles.locale) for emails and new devices; the profile is read at sign-in time, not on every request.
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  for (const part of ((await headers()).get("accept-language") ?? "").split(",")) {
    const lang = part.split(";")[0].trim().slice(0, 2).toLowerCase()
    if (isLocale(lang)) return lang
  }
  return defaultLocale
})

export const getT = cache(async () => {
  const locale = await getLocale()
  return createT(locale, messages[locale])
})
