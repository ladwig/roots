import Link from "next/link"
import { notFound } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { deletePosition, deleteSeries, savePosition, saveSeries } from "../actions"

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

export default async function ShiftSetup({ searchParams }: PageProps<"/shifts/setup">) {
  const ctx = await requirePerm("shifts.manage")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const [{ data: positions }, { data: series }, { data: locations }, { data: staff }] = await Promise.all([
    ctx.supabase.from("positions").select("*, locations(name)").eq("org_id", ctx.org.id).order("position").order("name"),
    ctx.supabase.from("shift_series").select("*, positions(name), locations(name)").eq("org_id", ctx.org.id).order("created_at"),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("staff").select("id, name").eq("org_id", ctx.org.id).eq("active", true).order("name"),
  ])
  const editing = series?.find((s) => s.id === param(sp, "series"))
  const creating = param(sp, "new") === "series"
  // 2026-10-05 is a Monday: weekday names in the user's language.
  const wd = (d: number) => t.date(`2026-10-${String(4 + d).padStart(2, "0")}T12:00:00Z`, { weekday: "short" })
  const staffName = new Map(staff?.map((s) => [s.id, s.name]))

  return (
    <div className="grid gap-8">
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <section className="grid gap-3" aria-labelledby="positions">
        <h2 id="positions" className="font-medium">
          {t("shifts.positionsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("shifts.positionsHint")}</p>
        <ul className="grid gap-2">
          {[...(positions ?? []), null].map((p) => (
            <li key={p?.id ?? "new"} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
              <form action={savePosition} className="flex flex-1 flex-wrap items-end gap-2">
                {p && <input type="hidden" name="id" value={p.id} />}
                <Input name="name" defaultValue={p?.name} required maxLength={100} placeholder={t("shifts.positionPlaceholder")} aria-label={t("shifts.position")} className="w-44" />
                <Input name="needed" type="number" min={1} max={100} defaultValue={p?.needed ?? 1} aria-label={t("shifts.needed")} className="w-20" />
                {(locations?.length ?? 0) > 0 && (
                  <NativeSelect name="location" defaultValue={p?.location_id ?? ""} aria-label={t("shifts.location")} className="w-40">
                    <NativeSelectOption value="">{t("shifts.anyLocation")}</NativeSelectOption>
                    {locations?.map((l) => (
                      <NativeSelectOption key={l.id} value={l.id}>
                        {l.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
                <SubmitButton size="sm" variant={p ? "outline" : "default"}>
                  {p ? t("common.save") : t("shifts.addPosition")}
                </SubmitButton>
              </form>
              {p && (
                <form action={deletePosition}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton size="icon-sm" variant="ghost" aria-label={t("shifts.remove")}>
                    <Trash2Icon />
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        {!locations?.length && (
          <p className="text-xs text-muted-foreground">
            {t("shifts.locationsHint")}{" "}
            <Link href="/settings/locations" className="underline underline-offset-4">
              {t("shifts.locationsLink")}
            </Link>
          </p>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="series">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="series" className="font-medium">
            {t("shifts.seriesTitle")}
          </h2>
          <Button render={<Link href={withParams(sp, { new: "series", series: undefined })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
            {t("shifts.newSeries")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("shifts.seriesHint")}</p>
        <DataTable
          rows={series ?? []}
          rowKey={(s) => s.id}
          rowHref={(s) => withParams(sp, { series: s.id, new: undefined })}
          empty={t("shifts.noSeries")}
          columns={[
            { header: t("shifts.position"), cell: (s) => <span className="font-medium">{s.positions?.name ?? s.name}</span> },
            {
              header: t("shifts.rhythm"),
              cell: (s) =>
                `${s.weekdays.map(wd).join(", ")} · ${s.every_weeks > 1 ? t("shifts.everyN", { count: s.every_weeks }) : t("shifts.weekly")} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`,
            },
            { header: t("shifts.fixedPeople"), cell: (s) => s.default_staff.map((id) => staffName.get(id)).filter(Boolean).join(", ") },
            { header: t("shifts.location"), cell: (s) => s.locations?.name },
          ]}
        />
      </section>

      {(creating || editing) && (
        <UrlSheet params={["new", "series"]} title={editing ? (editing.positions?.name ?? editing.name ?? "") : t("shifts.newSeries")}>
          <Notice error={param(sp, "error")} />
          <form action={saveSeries} className="grid gap-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="se-pos">{t("shifts.position")}</Label>
                <NativeSelect id="se-pos" name="position" defaultValue={editing?.position_id ?? ""} className="w-full">
                  <NativeSelectOption value="">–</NativeSelectOption>
                  {positions?.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-name">{t("shifts.titleLabel")}</Label>
                <Input id="se-name" name="name" defaultValue={editing?.name ?? ""} maxLength={100} placeholder={t("shifts.seriesNamePlaceholder")} />
              </div>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("shifts.weekdays")}</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="weekdays" value={d} defaultChecked={editing?.weekdays.includes(d)} className="size-4" />
                    {wd(d)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="se-every">{t("shifts.every")}</Label>
                <NativeSelect id="se-every" name="every_weeks" defaultValue={String(editing?.every_weeks ?? 1)} className="w-full">
                  {[1, 2, 3, 4].map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n === 1 ? t("shifts.weekly") : t("shifts.everyN", { count: n })}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-st">{t("shifts.from")}</Label>
                <Input id="se-st" name="start_time" type="time" required defaultValue={editing?.start_time.slice(0, 5) ?? "18:00"} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-et">{t("shifts.until")}</Label>
                <Input id="se-et" name="end_time" type="time" required defaultValue={editing?.end_time.slice(0, 5) ?? "23:00"} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="se-sd">{t("shifts.startDate")}</Label>
                <Input id="se-sd" name="start_date" type="date" required defaultValue={editing?.start_date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-ed">{t("shifts.endDate")}</Label>
                <Input id="se-ed" name="end_date" type="date" defaultValue={editing?.end_date ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="se-needed">{t("shifts.needed")}</Label>
                <Input id="se-needed" name="needed" type="number" min={1} max={100} defaultValue={editing?.needed ?? 1} />
              </div>
            </div>
            {(locations?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="se-loc">{t("shifts.location")}</Label>
                <NativeSelect id="se-loc" name="location" defaultValue={editing?.location_id ?? ""} className="w-full">
                  <NativeSelectOption value="">–</NativeSelectOption>
                  {locations?.map((l) => (
                    <NativeSelectOption key={l.id} value={l.id}>
                      {l.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            {(staff?.length ?? 0) > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("shifts.fixedPeople")}</legend>
                {staff?.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="default_staff" value={s.id} defaultChecked={editing?.default_staff.includes(s.id)} className="size-4" />
                    {s.name}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">{t("shifts.fixedHint")}</p>
              </fieldset>
            )}
            <p className="text-xs text-muted-foreground">{t("shifts.generateHint")}</p>
            <SubmitButton className="justify-self-start">{editing ? t("common.save") : t("shifts.newSeries")}</SubmitButton>
          </form>
          {editing && (
            <form action={deleteSeries}>
              <input type="hidden" name="id" value={editing.id} />
              <SubmitButton size="sm" variant="ghost">
                {t("shifts.deleteSeries")}
              </SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
