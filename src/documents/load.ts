import type { getT } from "@/i18n/server"
import type { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { buildView, type Seller } from "./model"

/** A document as DocView, for the print page and the PDF route. Null if it isn't the org's. */
export async function loadDocView(ctx: Awaited<ReturnType<typeof requirePerm>>, id: string, t: Awaited<ReturnType<typeof getT>>) {
  const [{ data: doc }, { data: billing }] = await Promise.all([
    ctx.supabase.from("documents").select("*, document_items(*)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("org_billing").select("*").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  if (!doc) return null
  const { data: source } = doc.source_id
    ? await ctx.supabase.from("documents").select("number, issue_date").eq("id", doc.source_id).eq("org_id", ctx.org.id).maybeSingle()
    : { data: null }
  // Issued: the frozen seller snapshot; drafts: current settings.
  const seller = ((doc.status !== "draft" && doc.seller) || billing || { tax_mode: "standard" }) as Seller
  const view = buildView(
    doc,
    doc.document_items.map((i) => ({ ...i, quantity: Number(i.quantity), tax_rate: Number(i.tax_rate) })),
    seller,
    (ctx.org.logo_path && imageUrl(ctx.org.logo_path)) || null,
    t,
    source,
  )
  return { doc, billing, view }
}
