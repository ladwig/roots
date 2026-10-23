// Own HTML start pages with placeholders (pure, tested): a small Mustache subset.
//   {{org.name}}            a value (HTML-escaped; dotted paths, keys may contain - like form slugs)
//   {{#events}}…{{/events}} a list: repeated per item, inside it {{title}} etc. refer to the item
//   {{#portal}}…{{/portal}} a value: shown when it's there (true, text, non-empty list)
//   {{^events}}…{{/events}} shown when it's NOT there (e.g. "no events planned")
// No raw HTML from data, no code: the result still goes through cleanHtml().
export type Data = Record<string, unknown>

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
function lookup(path: string, stack: Data[]) {
  if (path === ".") return stack[0]
  for (const scope of stack) {
    let v: unknown = scope
    let found = true
    for (const part of path.split(".")) {
      if (v && typeof v === "object" && part in (v as Data)) v = (v as Data)[part]
      else {
        found = false
        break
      }
    }
    if (found) return v
  }
  return undefined
}
const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v)

const SECTION = /\{\{([#^])\s*([\w.-]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/

function renderWith(tpl: string, stack: Data[], depth: number): string {
  if (depth > 8) return ""
  let out = ""
  let rest = tpl
  for (let m = SECTION.exec(rest); m; m = SECTION.exec(rest)) {
    out += values(rest.slice(0, m.index), stack)
    const [, kind, name, inner] = m
    const v = lookup(name, stack)
    if (kind === "^") out += truthy(v) ? "" : renderWith(inner, stack, depth + 1)
    else if (Array.isArray(v)) out += v.map((item) => renderWith(inner, [item as Data, ...stack], depth + 1)).join("")
    else if (truthy(v)) out += renderWith(inner, typeof v === "object" ? [v as Data, ...stack] : stack, depth + 1)
    rest = rest.slice(m.index + m[0].length)
  }
  return out + values(rest, stack)
}
const values = (s: string, stack: Data[]) =>
  s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name: string) => {
    const v = lookup(name, stack)
    return v == null || typeof v === "object" ? "" : esc(String(v))
  })

export const renderTemplate = (tpl: string, data: Data) => renderWith(tpl, [data], 0)

/** The placeholders a start page template can use (also shown in the editor and the API). */
export const START_PLACEHOLDERS: { key: string; note: string }[] = [
  { key: "org.name", note: "name" },
  { key: "org.tagline", note: "tagline" },
  { key: "org.logo", note: "logo" },
  { key: "#events … /events", note: "events" },
  { key: "title · date · time · weekday · day · month · venue · address · image · url · cancelled", note: "eventFields" },
  { key: "^events … /events", note: "noEvents" },
  { key: "next.title · next.url …", note: "next" },
  { key: "#forms … /forms", note: "forms" },
  { key: "form.<slug>.url", note: "form" },
  { key: "#portal … /portal · portal.url", note: "portal" },
  { key: "#wiki … /wiki", note: "wiki" },
  { key: "imprint_url · privacy_url", note: "legal" },
]

/** A start page template to begin with (editor default, API help). */
export const STARTER = `<style>
  .home { max-width: 960px; margin: 0 auto; padding: 48px 20px; display: grid; gap: 48px; }
  .hero { display: grid; gap: 12px; }
  .hero h1 { font-size: clamp(2.5rem, 6vw, 4.5rem); line-height: 1; margin: 0; }
  .hero p { font-size: 1.25rem; opacity: .75; margin: 0; }
  .events { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .event { display: grid; gap: 8px; text-decoration: none; color: inherit; border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  .event img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: calc(var(--radius) - 4px); }
  .button { display: inline-block; background: var(--primary); color: var(--primary-foreground); padding: 12px 20px; border-radius: var(--radius); text-decoration: none; font-weight: 600; }
</style>
<div class="home">
  <section class="hero">
    <h1>{{org.name}}</h1>
    <p>{{org.tagline}}</p>
    {{#next}}<p><a class="button" href="{{url}}">Tickets: {{title}}</a></p>{{/next}}
  </section>
  <section>
    <h2>Kommende Events</h2>
    <div class="events">
      {{#events}}
      <a class="event" href="{{url}}">
        <img src="{{image}}" alt="">
        <strong>{{title}}</strong>
        <span>{{date_short}} · {{time}} · {{venue}}</span>
      </a>
      {{/events}}
    </div>
    {{^events}}<p>Gerade keine Events geplant.</p>{{/events}}
  </section>
</div>`

/** Fixed blocks of the event page template: roots' own components, placed where the template says. */
export const EVENT_SLOTS = ["tickets", "timetable"] as const
export type EventSlot = (typeof EVENT_SLOTS)[number]
const marker = (slot: string) => `[[roots-slot:${slot}]]`
/** Slot values for renderTemplate(): text markers that survive escaping and cleaning. */
export const slotMarkers = () => Object.fromEntries(EVENT_SLOTS.map((s) => [s, marker(s)]))

/**
 * Rendered + cleaned template → the same HTML with <roots-slot name="…"> elements where roots' blocks go (first use of
 * each). Required slots missing from the template are added at the end, so e.g. ticket sales can't disappear.
 * (Added after cleaning: org HTML can't produce these elements itself.)
 */
export function placeSlots(html: string, required: EventSlot[] = []) {
  const seen = new Set<string>()
  const out = html.replace(/\[\[roots-slot:([a-z]+)\]\]/g, (_, slot: string) => {
    if (!(EVENT_SLOTS as readonly string[]).includes(slot) || seen.has(slot)) return ""
    seen.add(slot)
    return `<roots-slot name="${slot}"></roots-slot>`
  })
  return out + required.filter((r) => !seen.has(r)).map((r) => `<roots-slot name="${r}"></roots-slot>`).join("")
}

export const EVENT_PLACEHOLDERS: { key: string; note: string }[] = [
  { key: "event.title · event.date · event.time · event.end · event.venue · event.address", note: "event" },
  { key: "event.image · event.description · event.cancelled", note: "eventMore" },
  { key: "tickets", note: "tickets" },
  { key: "timetable", note: "timetable" },
  { key: "org.name · org.logo · org.url", note: "org" },
]

export const EVENT_STARTER = `<style>
  .event-page { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; display: grid; gap: 28px; }
  .event-hero img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius); }
  .event-hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.05; margin: 16px 0 8px; }
  .event-meta { opacity: .75; }
  .event-about { white-space: pre-line; }
</style>
<article class="event-page">
  <p><a href="{{org.url}}">← {{org.name}}</a></p>
  <header class="event-hero">
    {{#event.image}}<img src="{{event.image}}" alt="">{{/event.image}}
    <h1>{{event.title}}</h1>
    <p class="event-meta">{{event.date}} · {{event.time}}{{#event.venue}} · {{event.venue}}{{/event.venue}}</p>
    {{#event.cancelled}}<p><strong>Abgesagt</strong></p>{{/event.cancelled}}
  </header>
  {{#event.description}}<p class="event-about">{{event.description}}</p>{{/event.description}}
  {{timetable}}
  {{tickets}}
</article>`
