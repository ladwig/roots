import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { MAX_IMPORT_ROWS } from "@/app/(app)/contacts/fields"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { IMPORT_FIELDS } from "@/members/fields"
import { MemberImport } from "./import-form"

export default async function MemberImportPage() {
  const ctx = await requirePerm("members.manage")
  if (!ctx.modules.has("members") || !ctx.can("crm.manage")) notFound()
  const t = await getT()
  const [defs, { data: types }] = await Promise.all([
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
    ctx.supabase.from("membership_types").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ])
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link href="/members" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {t("membership.title")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("membership.importTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("membership.importHint", { types: t.list((types ?? []).map((x) => x.name)) || "–" })}</p>
      </div>
      {types?.length ? (
        <MemberImport
          defs={defs}
          types={types}
          labels={Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, t.has(f.label) ? t.dynamic(f.label) : f.label]))}
          maxRows={MAX_IMPORT_ROWS}
          today={new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })}
        />
      ) : (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("membership.noTypes")}</p>
      )}
    </div>
  )
}

export const instant = false
