import { MAX_IMPORT_ROWS } from "@/app/(app)/contacts/fields"
import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { IMPORT_FIELDS } from "@/members/fields"
import { MemberImport } from "./import-form"

// Member import (CSV/Excel): in a wide drawer on the members overview (?import=1).
export async function MemberImportBody({ ctx }: { ctx: Awaited<ReturnType<typeof getContext>> }) {
  const t = await getT()
  const [defs, { data: types }] = await Promise.all([
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
    ctx.supabase.from("membership_types").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ])
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("membership.importHint", { types: t.list((types ?? []).map((x) => x.name)) || "–" })}</p>
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
    </>
  )
}
