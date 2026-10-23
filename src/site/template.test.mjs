import assert from "node:assert/strict"
import { test } from "node:test"
import { placeSlots, renderTemplate, slotMarkers } from "./template.ts"

const data = {
  org: { name: "Coppi <3", tagline: "Club" },
  events: [{ title: "Sommerfest", url: "/e/sommer", cancelled: false }, { title: "Herbst", url: "/e/herbst", cancelled: true }],
  form: { "mitglied-werden": { url: "/f/mitglied-werden" } },
  portal: { url: "/portal" },
  wiki: [],
}

test("values are escaped, dotted paths and dashed keys work", () => {
  assert.equal(renderTemplate("<h1>{{org.name}}</h1>", data), "<h1>Coppi &#60;3</h1>")
  assert.equal(renderTemplate('<a href="{{form.mitglied-werden.url}}">x</a>', data), '<a href="/f/mitglied-werden">x</a>')
  assert.equal(renderTemplate("{{missing}}{{org}}", data), "")
})

test("lists, conditions, inverted sections, outer scope inside items", () => {
  const out = renderTemplate("{{#events}}<p>{{title}}{{#cancelled}} (abgesagt){{/cancelled}} · {{org.name}}</p>{{/events}}{{^wiki}}kein Wiki{{/wiki}}{{#portal}}<a href=\"{{url}}\">Login</a>{{/portal}}", data)
  assert.equal(out, "<p>Sommerfest · Coppi &#60;3</p><p>Herbst (abgesagt) · Coppi &#60;3</p>kein Wiki<a href=\"/portal\">Login</a>")
  assert.equal(renderTemplate("{{^events}}leer{{/events}}", { events: [] }), "leer")
})

test("event slots: placed where written (inside other tags), required ones appended, only once", () => {
  const html = renderTemplate("<article><h1>{{event.title}}</h1>{{timetable}}<p>x</p>{{timetable}}</article>", { event: { title: "Fest" }, ...slotMarkers() })
  assert.equal(placeSlots(html, ["tickets"]), '<article><h1>Fest</h1><roots-slot name="timetable"></roots-slot><p>x</p></article><roots-slot name="tickets"></roots-slot>')
})
