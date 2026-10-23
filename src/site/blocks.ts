// The public start page's blocks (pure, tested): which types exist, which module each needs, and the validation every
// entry path uses (Settings → Website, API). Blocks of a switched-off module stay stored but aren't shown or offered.
export const BLOCK_TYPES = [
  { type: "hero" },
  { type: "text" },
  { type: "links" },
  { type: "events", module: "events" },
  { type: "event", module: "events" },
  { type: "form", module: "forms" },
  { type: "portal", module: "members" },
  { type: "wiki", module: "wiki" },
] as const
export type BlockType = (typeof BLOCK_TYPES)[number]["type"]

export type Block = {
  id: string
  type: BlockType
  on: boolean
  title?: string
  text?: string // hero/portal: a short text; text block: Markdown
  button_label?: string
  button_href?: string
  limit?: number // events
  event_id?: string // event
  form_slug?: string // form
  items?: { label: string; href: string }[] // links
}

/** The page without a saved site: upcoming events, as the start page always showed. */
export const DEFAULT_BLOCKS: Block[] = [{ id: "events", type: "events", on: true, limit: 20 }]

export const blockAvailable = (type: string, modules: Iterable<string>) => {
  const def = BLOCK_TYPES.find((b) => b.type === type)
  return !!def && (!("module" in def) || new Set(modules).has(def.module))
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || undefined
/** Links: https/http, mail, phone, or a path on the site ("/e/sommerfest"). Anything else is dropped. */
export const safeHref = (v: unknown) => {
  const s = str(v, 500)
  return s && (/^https?:\/\/[^\s]+$/i.test(s) || /^(mailto|tel):[^\s]+$/i.test(s) || /^\/[^\s/][^\s]*$|^\/$/.test(s)) ? s : undefined
}
const newId = () => Math.random().toString(36).slice(2, 10)

/** Unknown input → clean blocks (max 30); invalid blocks are dropped, never an error. */
export function readBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 30).flatMap((raw): Block[] => {
    const b = (raw ?? {}) as Record<string, unknown>
    if (!BLOCK_TYPES.some((d) => d.type === b.type)) return []
    const type = b.type as BlockType
    const block: Block = { id: typeof b.id === "string" && /^[a-z0-9-]{1,40}$/.test(b.id) ? b.id : newId(), type, on: b.on !== false, title: str(b.title, 200) }
    if (type === "hero" || type === "portal") Object.assign(block, { text: str(b.text, 1000) })
    if (type === "hero") Object.assign(block, { button_label: str(b.button_label, 60), button_href: safeHref(b.button_href) })
    if (type === "text") {
      block.text = str(b.text, 20000)
      if (!block.text) return []
    }
    if (type === "events") block.limit = Math.min(50, Math.max(1, Math.round(Number(b.limit) || 10)))
    if (type === "event") {
      if (typeof b.event_id !== "string" || !/^[0-9a-f-]{36}$/.test(b.event_id)) return []
      block.event_id = b.event_id
    }
    if (type === "form") {
      if (typeof b.form_slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(b.form_slug)) return []
      block.form_slug = b.form_slug
    }
    if (type === "links") {
      block.items = (Array.isArray(b.items) ? b.items : [])
        .slice(0, 12)
        .flatMap((i) => {
          const label = str((i as Record<string, unknown>)?.label, 80)
          const href = safeHref((i as Record<string, unknown>)?.href)
          return label && href ? [{ label, href }] : []
        })
      if (!block.items.length) return []
    }
    return [Object.fromEntries(Object.entries(block).filter(([, v]) => v !== undefined)) as Block]
  })
}

/** An event's own links (max 3, title + http(s) URL), e.g. Telegram group, Instagram. Invalid rows are dropped. */
export function readEventLinks(input: unknown): { label: string; url: string }[] {
  if (!Array.isArray(input)) return []
  return input
    .flatMap((i) => {
      const label = str((i as Record<string, unknown>)?.label, 60)
      const url = str((i as Record<string, unknown>)?.url, 500)
      return label && url && /^https?:\/\/[^\s]+$/i.test(url) ? [{ label, url }] : []
    })
    .slice(0, 3)
}
