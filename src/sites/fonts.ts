import { Fraunces, Hanken_Grotesk, Inter, Space_Grotesk } from "next/font/google"

// The curated website fonts (theme.font). Not preloaded: a site downloads only the one its theme uses.
const sans = Inter({ subsets: ["latin"], variable: "--font-site-sans", preload: false, display: "swap" })
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-site-grotesk", preload: false, display: "swap" })
const humanist = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-site-humanist", preload: false, display: "swap" })
const serif = Fraunces({ subsets: ["latin"], variable: "--font-site-serif", preload: false, display: "swap" })

export const siteFontVars = [sans.variable, grotesk.variable, humanist.variable, serif.variable].join(" ")
