// Page documents come from the browser (Puck editor): check them before saving. Pure (tested).
// Only known block types survive (recursively, slots included), strings are capped, links are http(s)/mailto/tel or
// site-relative, images must live in the org's site folder, rich text loses scripts/handlers.
import { cleanHtml } from "../letters/model.ts"

type Node = { type: string; props: Record<string, unknown> }
export type PageData = { content: Node[]; root: { props: Record<string, unknown> }; zones?: Record<string, Node[]> }

export const MAX_BLOCKS = 300
const MAX_TEXT = 20_000

export function safeHref(v: unknown) {
  const s = String(v ?? "").trim().slice(0, 500)
  if (!s) return ""
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s
  if (/^\/(?!\/)/.test(s) || s.startsWith("#")) return s
  return ""
}

// Keys whose values are links / images / rich text; everything else that is a string is plain text.
const LINK_KEYS = /^(href|link|url)$/i
const IMAGE_KEYS = /^(image|logo|background)$/i
const RICH_KEYS = /^(richtext|body)$/i

export function sanitizePage(raw: unknown, allowed: readonly string[], orgId: string): PageData {
  let count = 0
  const imagePrefix = `orgs/${orgId}/site/`
  const value = (key: string, v: unknown, depth: number): unknown => {
    if (depth > 12) return null
    if (typeof v === "string") {
      if (LINK_KEYS.test(key)) return safeHref(v)
      if (IMAGE_KEYS.test(key)) return v.startsWith(imagePrefix) && /^[\w/.-]+$/.test(v) ? v : ""
      if (RICH_KEYS.test(key)) return cleanHtml(v).slice(0, MAX_TEXT)
      return v.slice(0, MAX_TEXT)
    }
    if (typeof v === "number") return Number.isFinite(v) ? v : 0
    if (typeof v === "boolean" || v === null) return v
    if (Array.isArray(v)) {
      // Slot content (array of blocks) or an array field (array of plain objects).
      if (v.every((x) => x && typeof x === "object" && "type" in x && "props" in x)) return nodes(v, depth + 1)
      return v.slice(0, 50).map((x) => value(key, x, depth + 1))
    }
    if (v && typeof v === "object") return props(v as Record<string, unknown>, depth + 1)
    return null
  }
  const props = (p: Record<string, unknown>, depth: number) =>
    Object.fromEntries(
      Object.entries(p)
        .filter(([k]) => /^[a-zA-Z0-9_-]{1,40}$/.test(k))
        .slice(0, 60)
        .map(([k, v]) => [k, value(k, v, depth)]),
    )
  const nodes = (list: unknown, depth: number): Node[] =>
    (Array.isArray(list) ? list : [])
      .filter((n): n is Node => !!n && typeof n === "object" && allowed.includes((n as Node).type) && count++ < MAX_BLOCKS)
      .map((n) => ({ type: n.type, props: props(n.props && typeof n.props === "object" ? n.props : {}, depth) }))

  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PageData>
  const zones = r.zones && typeof r.zones === "object" ? Object.entries(r.zones).slice(0, 200) : []
  return {
    content: nodes(r.content, 0),
    root: { props: props(r.root?.props && typeof r.root.props === "object" ? r.root.props : {}, 0) },
    ...(zones.length && { zones: Object.fromEntries(zones.filter(([k]) => k.length <= 200).map(([k, v]) => [k, nodes(v, 1)])) }),
  }
}

/** Page slug from a title or input: "Über uns" → "ueber-uns"; '' = home. */
export const pageSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")

// Public paths that pages can't take (they belong to modules or the platform).
export const RESERVED_SLUGS = ["e", "f", "t", "g", "u", "portal", "events", "imprint", "privacy", "api", "sitemap-xml", "robots-txt", "checkout", "site", "app"]
