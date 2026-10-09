import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { CONTACT_FIELDS, MAX_IMPORT_ROWS } from "../fields"
import { ContactImport } from "./import-form"

export default async function ContactImportPage() {
  const ctx = await requirePerm("crm.manage")
  if (!ctx.modules.has("crm")) notFound()
  const t = await getT()
  const defs = await loadFields(ctx.supabase, ctx.org.id, "contacts")
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {t("contacts.title")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("contacts.importTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("contacts.importHint")}</p>
      </div>
      <ContactImport
        defs={defs}
        labels={Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, t.dynamic(f.label)]))}
        matchLabel={t("contacts.email")}
        maxRows={MAX_IMPORT_ROWS}
      />
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
