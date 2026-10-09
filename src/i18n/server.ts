import { cache } from "react"
import { cookies, headers } from "next/headers"
import { defaultLocale, isLocale, messages, type Locale } from "./config"
import { createT } from "./translate"

export const LOCALE_COOKIE = "locale"

// Cookie (user's choice) → browser language → German.
// ponytail: cookie only; store on the profile once we send emails in the user's language.
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
