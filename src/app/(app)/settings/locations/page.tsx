import { Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { deleteLocation, saveLocation } from "../../shifts/actions"

// Places of the org (own club, external venues, café…), used by events and shift planning.
export default async function LocationsSettings({ searchParams }: PageProps<"/settings/locations">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("org.settings.manage")
  const { data: locations } = await ctx.supabase.from("locations").select("*").eq("org_id", ctx.org.id).order("name")
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("locations.intro")}</p>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ul className="grid gap-2">
        {[...(locations ?? []), ...(canManage ? [null] : [])].map((l) => (
          <li key={l?.id ?? "new"} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
            <form action={saveLocation} className="flex flex-1 flex-wrap items-end gap-2">
              {l && <input type="hidden" name="id" value={l.id} />}
              <Input name="name" defaultValue={l?.name} required maxLength={100} placeholder={t("locations.namePlaceholder")} aria-label={t("locations.name")} className="w-48" disabled={!canManage} />
              <Input name="address" defaultValue={l?.address ?? ""} maxLength={500} placeholder={t("locations.address")} aria-label={t("locations.address")} className="min-w-48 flex-1" disabled={!canManage} />
              {canManage && (
                <SubmitButton size="sm" variant={l ? "outline" : "default"}>
                  {l ? t("common.save") : t("locations.add")}
                </SubmitButton>
              )}
            </form>
            {l && canManage && (
              <form action={deleteLocation}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton size="icon-sm" variant="ghost" aria-label={t("shifts.remove")}>
                  <Trash2Icon />
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const instant = false
