import { SiteFrame } from "./_components/frame"

// Company details for Impressum + Datenschutz. ponytail: placeholders until the company data is final; fill in here once.
export const COMPANY = {
  name: "[Firmenname GmbH]",
  street: "[Straße Nr.]",
  city: "[PLZ] Berlin",
  country: "Deutschland",
  represented: "[Vorname Nachname]",
  email: "[kontakt@roots.de]",
  phone: "[+49 30 …]",
  register: "[Amtsgericht Charlottenburg, HRB …]",
  vat: "[DE …]",
  updated: "Oktober 2026",
}

/** Legal pages (/imprint, /privacy): always German (the binding version), plain readable prose. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SiteFrame>
      <main className="wrap pt-[clamp(56px,8vw,112px)] pb-[clamp(96px,12vw,176px)]">
        <article lang="de" className="legal grid max-w-[68ch] gap-4">
          <h1 className="display fs-h2 mb-6">{title}</h1>
          {children}
          <p className="soft mt-8 text-[14px]">Stand: {COMPANY.updated}</p>
        </article>
      </main>
    </SiteFrame>
  )
}
