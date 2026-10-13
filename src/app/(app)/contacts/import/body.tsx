import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { CONTACT_FIELDS, MAX_IMPORT_ROWS } from "../fields"
import { ContactImport } from "./import-form"

// Contact import (CSV/Excel): in a wide drawer on the contacts overview (?import=1).
export async function ContactImportBody({ ctx }: { ctx: Awaited<ReturnType<typeof getContext>> }) {
  const t = await getT()
  const defs = await loadFields(ctx.supabase, ctx.org.id, "contacts")
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("contacts.importHint")}</p>
      <ContactImport defs={defs} labels={Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, t.dynamic(f.label)]))} matchLabel={t("contacts.email")} maxRows={MAX_IMPORT_ROWS} />
    </>
  )
}
