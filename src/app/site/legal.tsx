import { SiteFrame } from "./_components/frame"

// Operator details for Impressum + Datenschutz. Empty fields are left out of the pages.
// ponytail: still missing the board members (required for an e.V.), a contact email and the Vereinsregister number.
export const COMPANY = {
  name: "Gude Laune e.V.",
  street: "Streustraße 20",
  city: "13086 Berlin",
  country: "Deutschland",
  represented: "",
  email: "",
  phone: "",
  register: "",
  vat: "",
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
