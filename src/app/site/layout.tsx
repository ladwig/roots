import type { Metadata } from "next"
import { Instrument_Serif, Libre_Franklin } from "next/font/google"
import { getT } from "@/i18n/server"
import "./site.css"

// The website's own look (docs/design/site.md): own fonts + tokens, scoped to .site, independent of the app theme.
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-site-serif", weight: "400", style: ["normal", "italic"] })
// Libre Franklin (Franklin Gothic lineage): an editorial, slightly old-fashioned grotesk instead of the default Inter look.
const text = Libre_Franklin({ subsets: ["latin"], variable: "--font-site-text" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("landing.meta.title"), description: t("landing.meta.description") }
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`site ${serif.variable} ${text.variable} min-h-dvh`}>{children}</div>
}
