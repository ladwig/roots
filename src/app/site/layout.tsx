import type { Metadata } from "next"
import { Inter, Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google"
import { getT } from "@/i18n/server"
import "./site.css"

// The website's own look (docs/design/site.md): own fonts + tokens, scoped to .site, independent of the app theme.
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-site-display", weight: ["500", "600", "700"] })
const body = Inter({ subsets: ["latin"], variable: "--font-site-body" })
const accent = Instrument_Serif({ subsets: ["latin"], variable: "--font-site-accent", weight: "400", style: "italic" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-site-mono", weight: "400" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("landing.meta.title"), description: t("landing.meta.description") }
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`site ${display.variable} ${body.variable} ${accent.variable} ${mono.variable} min-h-dvh`}>{children}</div>
}
