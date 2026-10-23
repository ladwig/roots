import assert from "node:assert/strict"
import { test } from "node:test"
import { blockAvailable, readBlocks, readEventLinks, safeHref } from "./blocks.ts"

test("safeHref: web, mail, phone and site paths only", () => {
  assert.equal(safeHref("https://qs1.studio/x"), "https://qs1.studio/x")
  assert.equal(safeHref("/e/sommerfest"), "/e/sommerfest")
  assert.equal(safeHref("mailto:a@b.de"), "mailto:a@b.de")
  assert.equal(safeHref("javascript:alert(1)"), undefined)
  assert.equal(safeHref("//evil.com"), undefined)
  assert.equal(safeHref("data:text/html,x"), undefined)
})

test("readBlocks: cleans, drops what's invalid, keeps order", () => {
  const out = readBlocks([
    { id: "a1", type: "hero", title: "  Hallo ", button_label: "Tickets", button_href: "javascript:x", on: true },
    { type: "text", text: "" },
    { type: "nope" },
    { id: "b2", type: "events", limit: 999, on: false },
    { type: "event", event_id: "x" },
    { id: "c3", type: "links", items: [{ label: "Insta", href: "https://instagram.com/qs1" }, { label: "bad", href: "ftp://x" }] },
    { id: "d4", type: "form", form_slug: "mitglied-werden", title: "Mitglied werden" },
  ])
  assert.deepEqual(out, [
    { id: "a1", type: "hero", on: true, title: "Hallo", button_label: "Tickets" },
    { id: "b2", type: "events", on: false, limit: 50 },
    { id: "c3", type: "links", on: true, items: [{ label: "Insta", href: "https://instagram.com/qs1" }] },
    { id: "d4", type: "form", on: true, title: "Mitglied werden", form_slug: "mitglied-werden" },
  ])
  assert.deepEqual(readBlocks("nope"), [])
})

test("blockAvailable: module blocks need their module", () => {
  assert.equal(blockAvailable("text", []), true)
  assert.equal(blockAvailable("events", ["crm"]), false)
  assert.equal(blockAvailable("events", ["events"]), true)
})

test("readEventLinks: max 3, http(s) only, needs a title", () => {
  assert.deepEqual(readEventLinks([{ label: " Telegram ", url: "https://t.me/+x" }, { label: "bad", url: "javascript:x" }, { label: "", url: "https://a.de" }, { label: "IG", url: "https://ig.com/c" }, { label: "RA", url: "https://ra.co/e" }, { label: "4", url: "https://x.de" }]), [
    { label: "Telegram", url: "https://t.me/+x" },
    { label: "IG", url: "https://ig.com/c" },
    { label: "RA", url: "https://ra.co/e" },
  ])
})
