import { test } from "node:test"
import assert from "node:assert/strict"
import { changeCart, deliveriesFor, paymentsFor, priceCart, readCart, readProduct, readShippingRates, shippingCents, slugify } from "./fields.ts"

const A = "11111111-1111-4111-8111-111111111111"
const V = "22222222-2222-4222-8222-222222222222"
const D = "33333333-3333-4333-8333-333333333333"

test("slugs", () => {
  assert.equal(slugify("Tour-Shirt 2026 (Größe ÄÖÜ)"), "tour-shirt-2026-groesse-aeoeue")
  assert.equal(slugify("  --  "), "")
})

test("cart cookie: junk dropped, duplicates merged, set/remove", () => {
  assert.deepEqual(readCart("nope"), [])
  assert.deepEqual(readCart(JSON.stringify([{ id: A, q: 2 }, { id: A, q: 1 }, { id: "x", q: 1 }, { id: V, q: 0 }])), [{ id: A, q: 3 }])
  let c = changeCart([], A, 1, "add")
  c = changeCart(c, A, 2, "add")
  assert.deepEqual(c, [{ id: A, q: 3 }])
  assert.deepEqual(changeCart(c, A, 0, "set"), [])
})

const catalog = [
  { id: A, slug: "shirt", name: "Shirt", kind: "physical", price_cents: 2500, tax_rate: 19, images: [], video_url: null, category: null, max_per_order: 5, left: null, variants: [{ id: V, name: "M", price_cents: 2700, left: 1, digital: false }] },
  { id: D, slug: "ebook", name: "E-Book", kind: "digital", price_cents: 900, tax_rate: 7, images: [], video_url: null, category: null, max_per_order: 1, left: null, variants: [] },
]

test("pricing: variant price + stock, product with variants can't be bought plain, limits", () => {
  const lines = priceCart([{ id: V, q: 2 }, { id: A, q: 1 }, { id: D, q: 2 }], catalog)
  assert.equal(lines.length, 2)
  assert.deepEqual([lines[0].name, lines[0].unit, lines[0].problem], ["Shirt · M", 2700, "sold_out"])
  assert.deepEqual([lines[1].unit, lines[1].tax_rate, lines[1].problem, lines[1].digital], [900, 7, "too_many", true])
  assert.equal(lines[0].digital, false)
})

test("shipping rates + free shipping", () => {
  const [r] = readShippingRates([{ name: "DHL Paket", cents: 490, free_from: 5000, countries: "de, at" }, { name: "", cents: 1 }])
  assert.deepEqual(r, { id: "r1", name: "DHL Paket", cents: 490, free_from: 5000, countries: ["DE", "AT"] })
  assert.equal(shippingCents(r, 4999), 490)
  assert.equal(shippingCents(r, 5000), 0)
})

test("delivery + payment options", () => {
  const s = { pay_online: true, pay_transfer: true, pay_on_pickup: true, pickup: true, shipping: true, shipping_rates: [{ name: "Post", cents: 300 }] }
  assert.deepEqual(deliveriesFor(s, [{ digital: true }]), ["digital"])
  assert.deepEqual(deliveriesFor(s, [{ digital: true }, { digital: false }]), ["pickup", "shipping"])
  assert.deepEqual(paymentsFor(s, "shipping", false), ["transfer"])
  assert.deepEqual(paymentsFor(s, "pickup", true), ["online", "transfer", "pickup"])
})

test("video embeds", async () => {
  const { videoEmbed } = await import("./fields.ts")
  assert.deepEqual(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" })
  assert.deepEqual(videoEmbed("https://youtu.be/dQw4w9WgXcQ"), { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" })
  assert.equal(videoEmbed("https://vimeo.com/123456")?.src, "https://player.vimeo.com/video/123456?dnt=1")
  assert.equal(videoEmbed("https://cdn.example.com/a.mp4")?.kind, "video")
  assert.equal(videoEmbed("https://evil.example.com/page"), null)
})

test("product input", async () => {
  const { readProduct, readVariant } = await import("./fields.ts")
  const get = (o) => (k) => o[k] ?? ""
  const r = readProduct(get({ name: "Tour-Shirt", price: "25,00", stock: "", tax_rate: "7" }))
  assert.deepEqual([r.row.slug, r.row.price_cents, r.row.stock, r.row.tax_rate, r.row.status], ["tour-shirt", 2500, null, 7, "draft"])
  assert.equal(readProduct(get({ name: "x", slug: "agb" })).error, "store.slugInvalid")
  assert.equal(readProduct(get({ name: "x", price: "abc" })).error, "store.priceInvalid")
  assert.deepEqual(readVariant(get({ name: "XL", price: "", stock: "3" })).row, { name: "XL", price_cents: null, stock: 3, active: true, digital: false, name_your_price: null })
  assert.equal(readVariant(get({ name: "Digital", digital: "1" })).row.digital, true)
})

test("shipping countries: EU expands, unknown codes dropped", () => {
  const [r] = readShippingRates([{ name: "EU", cents: 900, countries: "EU, CH, XX" }])
  assert.equal(r.countries.length, 28)
  assert.ok(r.countries.includes("FR") && r.countries.includes("CH") && !r.countries.includes("XX"))
})

test("release date: Berlin midnight, invalid rejected, empty = none", () => {
  const get = (o) => (k) => o[k] ?? ""
  assert.equal(readProduct(get({ name: "LP", release_on: "2026-11-27" })).row.release_at, "2026-11-26T23:00:00.000Z")
  assert.equal(readProduct(get({ name: "LP" })).row.release_at, null)
  assert.equal(readProduct(get({ name: "LP", release_on: "27.11.2026" })).error, "store.releaseInvalid")
})

test("name your price + single tracks in the cart", () => {
  const T = "44444444-4444-4444-8444-444444444444"
  const album = { id: A, slug: "lp", name: "LP", kind: "digital", price_cents: 800, tax_rate: 19, images: [], video_url: null, category: null, max_per_order: 5, left: null, variants: [], name_your_price: true, suggested_cents: 1000, track_price_cents: 150, tracks: [{ id: T, title: "Stigma" }] }
  const [def, chosen, low, track] = [
    priceCart([{ id: A, q: 1 }], [album])[0],
    priceCart([{ id: A, q: 1, p: 2500 }], [album])[0],
    priceCart([{ id: A, q: 1, p: 500 }], [album])[0],
    priceCart([{ id: T, q: 3, p: 200 }], [album])[0],
  ]
  assert.deepEqual([def.unit, def.problem], [1000, null]) // the suggestion
  assert.deepEqual([chosen.unit, chosen.problem], [2500, null])
  assert.equal(low.problem, "below_min")
  assert.deepEqual([track.name, track.quantity, track.unit, track.digital, track.trackId], ["LP – Stigma", 1, 200, true, T])
  assert.equal(priceCart([{ id: A, q: 1, p: 1 }], [{ ...album, name_your_price: false }])[0].unit, 800) // fixed price ignores p
  assert.deepEqual(readCart(JSON.stringify([{ id: A, q: 1, p: 1234 }, { id: V, q: 1, p: -5 }])), [{ id: A, q: 1, p: 1234 }, { id: V, q: 1 }])
  assert.deepEqual(changeCart([{ id: A, q: 1, p: 900 }], A, 2, "set"), [{ id: A, q: 2, p: 900 }])
})

test("variant options: read, combinations, plan", async () => {
  const { readOptions, optionCombos, planVariants } = await import("./fields.ts")
  const r = readOptions([{ name: " Farbe ", values: ["Schwarz", "Weiß", "Weiß", ""] }, { name: "Größe", values: ["S", "M"] }, { name: "", values: [] }])
  assert.deepEqual(r.options, [{ name: "Farbe", values: ["Schwarz", "Weiß"] }, { name: "Größe", values: ["S", "M"] }])
  assert.equal(readOptions([{ name: "Farbe", values: [] }]).error, "store.optionsInvalid")
  assert.equal(readOptions([{ name: "a", values: ["1"] }, { name: "A", values: ["2"] }]).error, "store.optionsInvalid")
  assert.equal(readOptions([{ name: "a", values: [...Array(11).keys()].map(String) }, { name: "b", values: [...Array(10).keys()].map(String) }]).error, "store.tooManyCombos")
  assert.deepEqual(optionCombos(r.options), [["Schwarz", "S"], ["Schwarz", "M"], ["Weiß", "S"], ["Weiß", "M"]])
  const plan = planVariants(r.options, [{ id: "a", option_values: ["Weiß", "M"] }, { id: "b", option_values: ["Grün", "S"] }, { id: "c", option_values: null }])
  assert.deepEqual(plan.keep, [{ id: "a", position: 3 }])
  assert.deepEqual(plan.create.map((c) => c.values.join("/")), ["Schwarz/S", "Schwarz/M", "Weiß/S"])
  assert.deepEqual(plan.remove, ["b", "c"])
  assert.deepEqual(planVariants([], [{ id: "c", option_values: null }]).remove, [])
})
