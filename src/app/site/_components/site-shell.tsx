import { Hanken_Grotesk } from "next/font/google"
import "../site.css"

// The website's own look (docs/design/site.md): own font + tokens, scoped to .site, independent of the app theme.
// Hanken Grotesk: a calm Swiss grotesk (closest free relative of Helvetica Now), for headlines and text.
const text = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-site-text" })

/** Wrap anything that should look like the website (landing page, /style/site). */
export function SiteShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`site ${text.variable} min-h-dvh ${className ?? ""}`}>{children}</div>
}
