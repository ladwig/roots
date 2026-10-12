// Website themes: a preset + a few overrides (primary colour, font, corner radius) → CSS variables on the page
// wrapper. Blocks only use these variables (var(--s-…)), never their own colours. Pure (tested).

export const FONTS = ["sans", "grotesk", "humanist", "serif"] as const
export type FontKey = (typeof FONTS)[number]
export const RADII = ["none", "small", "large"] as const

type Preset = { bg: string; fg: string; muted: string; card: string; line: string; primary: string; primaryFg: string; font: FontKey; radius: (typeof RADII)[number] }
export const PRESETS: Record<string, Preset> = {
  klar: { bg: "#ffffff", fg: "#111827", muted: "#6b7280", card: "#f3f4f6", line: "#e5e7eb", primary: "#111827", primaryFg: "#ffffff", font: "sans", radius: "small" },
  papier: { bg: "#f5f1e8", fg: "#191813", muted: "#6b675d", card: "#ece6d8", line: "#d9d2c1", primary: "#191813", primaryFg: "#f5f1e8", font: "humanist", radius: "none" },
  nacht: { bg: "#0e0e11", fg: "#f4f4f5", muted: "#a1a1aa", card: "#1b1b21", line: "#2e2e36", primary: "#d9f99d", primaryFg: "#0e0e11", font: "grotesk", radius: "small" },
  verein: { bg: "#ffffff", fg: "#1f2937", muted: "#64748b", card: "#f1f5f9", line: "#e2e8f0", primary: "#1d4ed8", primaryFg: "#ffffff", font: "sans", radius: "large" },
  kraeftig: { bg: "#fff7ed", fg: "#1c1917", muted: "#78716c", card: "#ffedd5", line: "#fed7aa", primary: "#ea580c", primaryFg: "#ffffff", font: "serif", radius: "large" },
}
export const PRESET_KEYS = Object.keys(PRESETS)

export type Theme = { preset: string; primary?: string; font?: FontKey; radius?: (typeof RADII)[number] }

const HEX = /^#[0-9a-f]{6}$/i
/** A theme from untrusted JSON (form, DB): unknown values fall back to the preset. */
export function readTheme(raw: unknown): Theme {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const preset = typeof r.preset === "string" && PRESETS[r.preset] ? r.preset : "klar"
  return {
    preset,
    ...(typeof r.primary === "string" && HEX.test(r.primary) && { primary: r.primary.toLowerCase() }),
    ...((FONTS as readonly string[]).includes(String(r.font)) && { font: r.font as FontKey }),
    ...((RADII as readonly string[]).includes(String(r.radius)) && { radius: r.radius as Theme["radius"] }),
  }
}

/** Readable text on a background colour: dark or light (WCAG relative luminance). */
export function textOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff"
}

const RADIUS_PX = { none: "0px", small: "6px", large: "16px" }

/** CSS variables for the page wrapper (font families come from src/sites/fonts.ts via --s-font-*). */
export function themeVars(t: Theme): Record<string, string> {
  const p = PRESETS[t.preset] ?? PRESETS.klar
  const primary = t.primary ?? p.primary
  const font = t.font ?? p.font
  return {
    "--s-bg": p.bg,
    "--s-fg": p.fg,
    "--s-muted": p.muted,
    "--s-card": p.card,
    "--s-line": p.line,
    "--s-primary": primary,
    "--s-primary-fg": t.primary ? textOn(primary) : p.primaryFg,
    "--s-radius": RADIUS_PX[t.radius ?? p.radius],
    "--s-font": `var(--font-site-${font})`,
  }
}
