import { cache } from "react"
import { cookies, headers } from "next/headers"
import { defaultLocale, isLocale, messages, type Locale } from "./config"
import { createT } from "./translate"

export const LOCALE_COOKIE = "locale"

// Cookie (choice on this device) → browser language → German. The choice is also saved on the profile
// (profiles.locale) for emails and new devices; the profile is read at sign-in time, not on every request.
export const getLocale = cache(async (): Promise<Locale> => {
  // A public page of an org (the proxy says which): the org's language if it set one (Website › Marke).
  const site = (await headers()).get("x-roots-site")
  if (site) {
    const { cachedOrg, cachedSite } = await import("@/lib/public-cache")
    const org = await cachedOrg(site)
    const fixed = org && ((await cachedSite(org.id))?.theme as { locale?: string } | undefined)?.locale
    if (isLocale(fixed)) return fixed
  }
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

/** For mails to an org's buyers/guests (no request): the org's public language, else German. */
export async function orgT(orgId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { data } = await createAdminClient().from("org_sites").select("theme").eq("org_id", orgId).maybeSingle()
  const l = (data?.theme as { locale?: string } | null)?.locale
  const locale = isLocale(l) ? l : defaultLocale
  return createT(locale, messages[locale])
}
