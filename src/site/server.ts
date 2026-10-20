// The org's public start page: saving (App + API, same validation) and the default Impressum text.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { readBlocks, type Block } from "./blocks"

export type SiteInput = { tagline?: string | null; blocks?: unknown; imprint?: string | null; privacy?: string | null }
export const SITE_COLS = "tagline, blocks, imprint, privacy, updated_at"
const text = (v: string | null | undefined, max: number) => (v == null ? undefined : v.trim().slice(0, max) || null)

/** Saves the given parts (others stay). Blocks are cleaned by readBlocks(). */
export async function saveSite(db: SupabaseClient<Database>, orgId: string, input: SiteInput) {
  const row = {
    org_id: orgId,
    ...(input.tagline !== undefined && { tagline: text(input.tagline, 300) }),
    ...(input.blocks !== undefined && { blocks: readBlocks(input.blocks) as never }),
    ...(input.imprint !== undefined && { imprint: text(input.imprint, 20000) }),
    ...(input.privacy !== undefined && { privacy: text(input.privacy, 60000) }),
  }
  return db.from("org_sites").upsert(row, { onConflict: "org_id" }).select(SITE_COLS).single()
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

export type { Block }
