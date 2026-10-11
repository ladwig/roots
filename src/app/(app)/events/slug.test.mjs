import { test } from "node:test"
import assert from "node:assert/strict"
import { slugify } from "./slug.ts"

const valid = /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/
test("slugify", () => {
  assert.equal(slugify("Sommerfest 2026 – Übermorgen!"), "sommerfest-2026-uebermorgen")
  assert.equal(slugify("Café Noir"), "cafe-noir")
  for (const s of ["!", "a", "🎉🎉", "x".repeat(200), "a -".repeat(40)]) assert.match(slugify(s), valid, s)
})
