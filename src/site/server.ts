// The org's public website settings: start page, brand, header/footer, legal texts. Editing writes a draft (the whole
// site as one object); publishing copies it live. Same functions for the App and the API, same validation.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { DEFAULT_BLOCKS, readBlocks, type Block } from "./blocks"
import { cleanCss, cleanHtml, cleanPage } from "./html"
import { readTheme, type Theme } from "./theme"

type Db = SupabaseClient<Database>
export type SiteContent = {
  tagline: string | null
  blocks: Block[]
  theme: Theme
  css: string | null
  header_html: string | null
  footer_html: string | null
  imprint: string | null
  privacy: string | null
  home_mode: "blocks" | "html"
  home_html: string | null
  event_html: string | null
}
export const CONTENT_KEYS = ["tagline", "blocks", "theme", "css", "header_html", "footer_html", "imprint", "privacy", "home_mode", "home_html", "event_html"] as const
const COLS = `${CONTENT_KEYS.join(", ")}, draft, published_at, updated_at`

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null)
/** Unknown input → clean content (HTML through the allowlist, CSS cleaned, blocks and theme validated). */
export function readContent(input: Record<string, unknown>): Partial<SiteContent> {
  const out: Partial<SiteContent> = {}
  if ("tagline" in input) out.tagline = text(input.tagline, 300)
  if ("blocks" in input) out.blocks = readBlocks(input.blocks)
  if ("theme" in input) out.theme = readTheme(input.theme)
  if ("css" in input) out.css = text(typeof input.css === "string" ? cleanCss(input.css) : null, 50000)
  if ("header_html" in input) out.header_html = text(typeof input.header_html === "string" ? cleanHtml(input.header_html) : null, 50000)
  if ("footer_html" in input) out.footer_html = text(typeof input.footer_html === "string" ? cleanHtml(input.footer_html) : null, 50000)
  if ("imprint" in input) out.imprint = text(input.imprint, 20000)
  if ("privacy" in input) out.privacy = text(input.privacy, 60000)
  if ("home_mode" in input) out.home_mode = input.home_mode === "html" ? "html" : "blocks"
  if ("event_html" in input) out.event_html = text(typeof input.event_html === "string" ? cleanPage(input.event_html) : null, 100000)
  if ("home_html" in input) out.home_html = text(typeof input.home_html === "string" ? cleanPage(input.home_html) : null, 100000)
  return out
}

const fromRow = (r: Record<string, unknown> | null): SiteContent => ({
  tagline: (r?.tagline as string) ?? null,
  blocks: r ? readBlocks(r.blocks) : DEFAULT_BLOCKS,
  theme: readTheme(r?.theme),
  css: (r?.css as string) ?? null,
  header_html: (r?.header_html as string) ?? null,
  footer_html: (r?.footer_html as string) ?? null,
  imprint: (r?.imprint as string) ?? null,
  privacy: (r?.privacy as string) ?? null,
  home_mode: r?.home_mode === "html" ? "html" : "blocks",
  home_html: (r?.home_html as string) ?? null,
  event_html: (r?.event_html as string) ?? null,
})

/** Live and draft content (draft = live when nothing is pending). */
export async function loadSite(db: Db, orgId: string) {
  const { data } = await db.from("org_sites").select(COLS).eq("org_id", orgId).maybeSingle()
  const row = data as Record<string, unknown> | null
  const live = fromRow(row)
  const draft = row?.draft ? { ...live, ...fromRow({ ...live, ...(row.draft as object) }) } : live
  return { live, draft, pending: !!row?.draft, publishedAt: (row?.published_at as string) ?? null, version: String(row?.updated_at ?? "0"), exists: !!row }
}

/** Changes the draft (only the given parts). Nothing is public until publishSite(). */
export async function saveDraft(db: Db, orgId: string, input: Record<string, unknown>) {
  const { draft } = await loadSite(db, orgId)
  const next = { ...draft, ...readContent(input) }
  return db.from("org_sites").upsert({ org_id: orgId, draft: next as never }, { onConflict: "org_id" }).select("org_id").single()
}

/** The draft goes live. */
export async function publishSite(db: Db, orgId: string) {
  const { draft } = await loadSite(db, orgId)
  return db
    .from("org_sites")
    .upsert({ org_id: orgId, ...(draft as never as object), draft: null, published_at: new Date().toISOString() } as never, { onConflict: "org_id" })
    .select("org_id")
    .single()
}

export async function discardDraft(db: Db, orgId: string) {
  return db.from("org_sites").update({ draft: null }).eq("org_id", orgId)
}

/** A starting Impressum from the invoice settings (Rechnungen → Einstellungen), for the org to check and complete. */
export function imprintDraft(b: { legal_name?: string | null; street?: string | null; postal_code?: string | null; city?: string | null; email?: string | null; phone?: string | null; representatives?: string | null; register?: string | null; vat_id?: string | null } | null, orgName: string) {
  const lines = [
    `**${b?.legal_name || orgName}**`,
    b?.street,
    [b?.postal_code, b?.city].filter(Boolean).join(" ") || undefined,
    "",
    b?.representatives && `Vertreten durch: ${b.representatives}`,
    b?.register && `Registereintrag: ${b.register}`,
    b?.vat_id && `USt-IdNr.: ${b.vat_id}`,
    "",
    b?.email && `E-Mail: ${b.email}`,
    b?.phone && `Telefon: ${b.phone}`,
  ]
  return lines.filter((l) => l !== undefined && l !== null).join("  \n").replace(/(  \n){3,}/g, "\n\n")
}

export type { Block, Theme }
