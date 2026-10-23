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
