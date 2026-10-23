import assert from "node:assert/strict"
import { test } from "node:test"
import { fontsHref, readableOn, readTheme, themeCss } from "./theme.ts"

test("readTheme keeps valid values only", () => {
  assert.deepEqual(readTheme({ mode: "dark", background: "#111111", text: "red", accent: "#C8FF00", font_body: "inter", font_heading: "comic", radius: "round", x: 1 }), {
    mode: "dark", background: "#111111", accent: "#c8ff00", font_body: "inter", radius: "round",
  })
  assert.deepEqual(readTheme(null), {})
})

test("readableOn picks black or white", () => {
  assert.equal(readableOn("#c8ff00"), "#000000")
  assert.equal(readableOn("#1d4ed8"), "#ffffff")
})

test("themeCss: only what's set; derived greys; fonts", () => {
  assert.equal(themeCss({}), ".site-theme {  background: var(--background); color: var(--foreground); }")
  const css = themeCss({ background: "#000000", text: "#ffffff", accent: "#c8ff00", font_body: "space-grotesk", radius: "square" })
  assert.match(css, /--background: #000000;/)
  assert.match(css, /--primary-foreground: #000000;/)
  assert.match(css, /--muted-foreground: color-mix/)
  assert.match(css, /--radius: 0rem;/)
  assert.match(css, /font-family: "Space Grotesk", sans-serif;/)
  assert.equal(fontsHref({ font_body: "dm-sans", font_heading: "playfair" }), "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap")
  assert.equal(fontsHref({}), null)
})
