// Server side of org websites: everything a page render needs (theme, nav, live module data) as Puck metadata.
import type { getT } from "@/i18n/server"
import { cachedSiteData } from "@/lib/public-cache"
import type { SiteEvent, SiteForm, SiteMeta } from "./blocks"
import { readTheme } from "./theme"

type T = Awaited<ReturnType<typeof getT>>
export type Legal = {
  legal_name: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  website: string | null
  representatives: string | null
  register: string | null
  vat_id: string | null
} | null

/** Metadata for the blocks + the legal details. Only public data, from the org's public cache. */
export async function siteMeta(
  org: { id: string; slug: string; name: string; logo_path: string | null },
  site: { theme: unknown; nav: { slug: string; title: string }[] },
  base: string,
  t: T,
): Promise<{ meta: SiteMeta; legal: Legal }> {
  const { extras, events, year } = await cachedSiteData(org.id) // cached; refreshed on any public change of the org
  const x = (extras ?? {}) as { modules?: string[]; forms?: SiteForm[]; legal?: Legal }
  return {
    meta: {
      orgId: org.id,
      orgName: x.legal?.legal_name || org.name,
      logo: org.logo_path,
      base,
      theme: readTheme(site.theme),
      nav: site.nav,
      events: (events ?? []) as SiteEvent[],
      forms: x.forms ?? [],
      modules: x.modules ?? [],
      locale: t.locale,
      year,
      labels: { imprint: t("sites.imprint"), privacy: t("sites.privacy"), more: t("sites.more"), noEvents: t("site.noEvents"), poweredBy: t("sites.poweredBy") },
    },
    legal: x.legal ?? null,
  }
}

const esc = (s: string | null | undefined) => (s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Impressum of an org website, from the org's invoice settings (always German: the binding version). */
export function imprintHtml(orgName: string, l: Legal) {
  const lines = (xs: (string | null | undefined)[]) => xs.filter(Boolean).map(esc).join("<br>")
  return [
    "<h2>Angaben gemäß § 5 DDG</h2>",
    `<p>${lines([l?.legal_name || orgName, l?.street, [l?.postal_code, l?.city].filter(Boolean).join(" ")])}</p>`,
    l?.representatives || l?.register || l?.vat_id
      ? `<p>${lines([l?.representatives && `Vertreten durch: ${l.representatives}`, l?.register && `Registereintrag: ${l.register}`, l?.vat_id && `USt-IdNr.: ${l.vat_id}`])}</p>`
      : "",
    l?.email || l?.phone ? `<h3>Kontakt</h3><p>${lines([l?.email && `E-Mail: ${l.email}`, l?.phone && `Telefon: ${l.phone}`])}</p>` : "",
    `<h3>Verantwortlich für den Inhalt</h3><p>${lines([l?.representatives || l?.legal_name || orgName])}</p>`,
    "<p>Diese Website wird mit roots betrieben. Für die Inhalte ist der oben genannte Anbieter verantwortlich.</p>",
  ].join("")
}

/** Datenschutzerklärung of an org website: a template filled with the org's details. */
export function privacyHtml(orgName: string, l: Legal, modules: string[]) {
  const who = esc(l?.legal_name || orgName)
  const contact = [l?.street, [l?.postal_code, l?.city].filter(Boolean).join(" "), l?.email && `E-Mail: ${l.email}`].filter(Boolean).map(esc).join("<br>")
  return [
    `<h2>1. Verantwortlicher</h2><p>${who}${contact ? `<br>${contact}` : ""}</p>`,
    "<h2>2. Hosting und Server-Logs</h2><p>Diese Website wird über die Plattform roots betrieben (Hosting in der EU bzw. im Vereinigten Königreich). Beim Aufruf werden technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser) kurzzeitig in Server-Logs verarbeitet, um die Website sicher auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).</p>",
    "<h2>3. Cookies und Tracking</h2><p>Wir setzen keine Analyse- oder Werbe-Tools ein. Cookies werden nur verwendet, soweit sie technisch notwendig sind (z. B. für den Mitgliederbereich).</p>",
    modules.includes("forms") ? "<h2>4. Formulare</h2><p>Wenn Sie uns über ein Formular schreiben oder sich anmelden, verarbeiten wir Ihre Angaben, um Ihre Anfrage zu bearbeiten bzw. die Anmeldung durchzuführen (Art. 6 Abs. 1 lit. b DSGVO).</p>" : "",
    modules.includes("tickets") ? "<h2>5. Tickets und Zahlungen</h2><p>Für Ticketkäufe verarbeiten wir Name, E-Mail und Bestelldaten. Die Zahlung erfolgt über einen Zahlungsdienstleister (z. B. Stripe oder SumUp), an den Sie Ihre Zahlungsdaten direkt übermitteln.</p>" : "",
    "<h2>Ihre Rechte</h2><p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Wenden Sie sich dazu an die oben genannte Adresse.</p>",
  ].join("")
}
