import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { ObjectForm } from "../parts"

// New object; ?parent=<id>&kind=key preselects (from an object page: "+ Raum", "+ Schlüssel").
export default async function NewObjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("rentals.manage")
  const t = await getT()
  const sp = await searchParams
  const [{ data: objects }, { data: locations }, defs] = await Promise.all([
    ctx.supabase.from("rental_objects").select("id, name, parent_id, kind").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(1000),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "rental_objects"),
  ])
  return (
    <NewPage list={{ href: "/rentals", label: t("rentals.nav") }} title={t("rentals.newObject")} error={param(sp, "error")}>
      <ObjectForm t={t} objects={objects ?? []} locations={locations ?? []} defs={defs} parentId={param(sp, "parent")} kind={param(sp, "kind")} />
    </NewPage>
  )
}

export const instant = false
