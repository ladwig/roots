import type { Metadata } from "next"
import { Hanken_Grotesk, Instrument_Serif } from "next/font/google"
import { getT } from "@/i18n/server"
import "./site.css"

// The website's own look (docs/design/site.md): own fonts + tokens, scoped to .site, independent of the app theme.
// Instrument Serif: only the wordmark and one italic accent word per headline.
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-site-serif", weight: "400", style: ["normal", "italic"] })
// Hanken Grotesk: a calm Swiss grotesk (closest free relative of Helvetica Now), for headlines and text.
const text = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-site-text" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("landing.meta.title"), description: t("landing.meta.description") }
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`site ${serif.variable} ${text.variable} min-h-dvh`}>{children}</div>
}
