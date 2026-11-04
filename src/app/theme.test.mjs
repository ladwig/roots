import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Achromatic OKLCH grey: relative luminance Y = L³. WCAG contrast = (Y1 + 0.05) / (Y2 + 0.05).
const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8")
const dark = css.slice(css.indexOf(".dark {"))
const token = (name) => {
  const m = dark.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)`))
  assert.ok(m, `--${name} missing in .dark`)
  assert.equal(Number(m[2]), 0, `--${name} must be grey for this check`)
  return Number(m[1]) ** 3
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

test("dark --input has ≥ 3:1 contrast against --popover, --card and --background", () => {
  const input = token("input")
  for (const bg of ["popover", "card", "background"]) {
    const c = contrast(input, token(bg))
    assert.ok(c >= 3, `--input vs --${bg}: ${c.toFixed(2)}:1`)
  }
})
