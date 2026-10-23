// An org's brand on all its public pages (pure, tested): colours, fonts, corners, light/dark → CSS for the wrapper
// around the public pages (s/[site]/layout.tsx). Public pages use the theme tokens (bg-background, bg-primary …), so
// overriding the tokens restyles every page at once. Empty values = roots' default look.
export const FONTS = [
  { key: "inter", family: "Inter", fallback: "sans-serif" },
  { key: "dm-sans", family: "DM Sans", fallback: "sans-serif" },
  { key: "manrope", family: "Manrope", fallback: "sans-serif" },
  { key: "space-grotesk", family: "Space Grotesk", fallback: "sans-serif" },
  { key: "work-sans", family: "Work Sans", fallback: "sans-serif" },
  { key: "ibm-plex-sans", family: "IBM Plex Sans", fallback: "sans-serif" },
  { key: "archivo", family: "Archivo", fallback: "sans-serif" },
  { key: "syne", family: "Syne", fallback: "sans-serif" },
  { key: "playfair", family: "Playfair Display", fallback: "serif" },
  { key: "fraunces", family: "Fraunces", fallback: "serif" },
] as const
export const RADII = { square: "0rem", soft: "0.5rem", round: "1rem" } as const

export type Theme = {
  locale?: "auto" | "de" | "en" // language of the public pages + buyer emails; auto = the visitor's browser
  mode?: "light" | "dark"
  background?: string // #rrggbb
  text?: string
  accent?: string
  font_body?: string // FONTS key
  font_heading?: string
  radius?: keyof typeof RADII
}

const HEX = /^#[0-9a-f]{6}$/i
const hex = (v: unknown) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : undefined)
const font = (v: unknown) => (FONTS.some((f) => f.key === v) ? (v as string) : undefined)

/** Unknown input → a clean theme (unknown or invalid values are dropped). */
export function readTheme(input: unknown): Theme {
  const t = (input ?? {}) as Record<string, unknown>
  const out: Theme = {
    locale: t.locale === "de" || t.locale === "en" ? t.locale : undefined,
    mode: t.mode === "dark" ? "dark" : t.mode === "light" ? "light" : undefined,
    background: hex(t.background),
    text: hex(t.text),
    accent: hex(t.accent),
    font_body: font(t.font_body),
    font_heading: font(t.font_heading),
    radius: typeof t.radius === "string" && t.radius in RADII ? (t.radius as Theme["radius"]) : undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Theme
}

/** Black or white, whichever reads better on the colour (WCAG relative luminance). */
export function readableOn(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.179 ? "#000000" : "#ffffff"
}

const familyOf = (key?: string) => {
  const f = FONTS.find((x) => x.key === key)
  return f ? `"${f.family}", ${f.fallback}` : undefined
}

/** The CSS for `.site-theme` (the wrapper of all public pages). */
export function themeCss(t: Theme) {
  const vars: string[] = []
  const set = (name: string, value?: string) => value && vars.push(`--${name}: ${value};`)
  const mix = (pct: number) => `color-mix(in oklab, var(--foreground) ${pct}%, var(--background))`
  set("background", t.background)
  set("card", t.background)
  set("popover", t.background)
  set("secondary", t.background)
  set("foreground", t.text)
  set("card-foreground", t.text)
  set("popover-foreground", t.text)
  set("secondary-foreground", t.text)
  if (t.background || t.text) {
    set("muted", mix(6))
    set("accent", mix(8))
    set("accent-foreground", "var(--foreground)")
    set("muted-foreground", mix(62))
    set("border", mix(14))
    set("input", mix(18))
  }
  set("primary", t.accent)
  set("ring", t.accent)
  set("primary-foreground", t.accent && readableOn(t.accent))
  set("radius", t.radius && RADII[t.radius])
  const body = familyOf(t.font_body)
  const heading = familyOf(t.font_heading) ?? body
  return [
    `.site-theme { ${vars.join(" ")} background: var(--background); color: var(--foreground);${body ? ` font-family: ${body};` : ""} }`,
    heading ? `.site-theme :is(h1, h2, h3, h4, .font-heading) { font-family: ${heading}; }` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Google Fonts stylesheet for the theme's fonts, or null. */
export function fontsHref(t: Theme) {
  const keys = [...new Set([t.font_body, t.font_heading].filter(Boolean))]
  const fams = keys.map((k) => FONTS.find((f) => f.key === k)!).map((f) => `family=${f.family.replace(/ /g, "+")}:wght@400;500;600;700`)
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap` : null
}
