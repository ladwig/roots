import { test } from "node:test"
import assert from "node:assert/strict"
import { pageSlug, safeHref, sanitizePage } from "./sanitize.ts"
import { readTheme, textOn, themeVars } from "./theme.ts"

const ORG = "11111111-1111-1111-1111-111111111111"

test("sanitizePage keeps known blocks, cleans links, images, rich text, recurses into slots", () => {
  const page = sanitizePage(
    {
      content: [
        { type: "Hero", props: { id: "h1", title: "Hallo", href: "javascript:alert(1)", image: `orgs/${ORG}/site/a.webp` } },
        { type: "Evil", props: { id: "x" } },
        { type: "Text", props: { id: "t1", richtext: '<p onclick="x()">Hi</p><script>bad()</script>' } },
        { type: "Columns", props: { id: "c1", left: [{ type: "Image", props: { id: "i1", image: "orgs/other/site/b.png", href: "/kontakt" } }, { type: "Evil", props: {} }] } },
        { type: "Buttons", props: { id: "b1", buttons: [{ label: "Mail", href: "mailto:a@b.de" }, { label: "Bad", href: "//evil.com" }] } },
      ],
      root: { props: { title: "Start" } },
    },
    ["Hero", "Text", "Columns", "Image", "Buttons"],
    ORG,
  )
  assert.deepEqual(
    page.content.map((n) => n.type),
    ["Hero", "Text", "Columns", "Buttons"],
  )
  assert.equal(page.content[0].props.href, "")
  assert.equal(page.content[0].props.image, `orgs/${ORG}/site/a.webp`)
  assert.equal(page.content[1].props.richtext, "<p>Hi</p>")
  const slot = page.content[2].props.left
  assert.equal(slot.length, 1)
  assert.equal(slot[0].props.image, "")
  assert.equal(slot[0].props.href, "/kontakt")
  assert.deepEqual(
    page.content[3].props.buttons.map((b) => b.href),
    ["mailto:a@b.de", ""],
  )
  assert.deepEqual(sanitizePage("nope", [], ORG), { content: [], root: { props: {} } })
})

test("safeHref + pageSlug", () => {
  assert.equal(safeHref("https://x.de"), "https://x.de")
  assert.equal(safeHref("#kontakt"), "#kontakt")
  assert.equal(safeHref("data:text/html,x"), "")
  assert.equal(pageSlug("Über uns & Team!"), "ueber-uns-team")
})

test("themes: presets, overrides, readable text on a custom colour", () => {
  assert.deepEqual(readTheme({ preset: "nope", primary: "red", font: "comic" }), { preset: "klar" })
  const t = readTheme({ preset: "verein", primary: "#FFEE00", radius: "none" })
  assert.equal(t.primary, "#ffee00")
  const vars = themeVars(t)
  assert.equal(vars["--s-primary"], "#ffee00")
  assert.equal(vars["--s-primary-fg"], "#111111")
  assert.equal(vars["--s-radius"], "0px")
  assert.equal(textOn("#1d4ed8"), "#ffffff")
})
