import { CalendarView, type CalendarItem } from "@/components/calendar-view"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { ABSENCE_KINDS } from "@/hr/fields"
import { absenceDays } from "@/hr/pay"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { deleteAbsence, saveAbsence } from "../actions"

const COLORS: Record<string, string> = { vacation: "var(--chart-1)", sick: "var(--destructive)", unpaid: "var(--chart-4)", other: "var(--chart-3)" }
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)

// Who's away when: holiday, sick, unpaid, other. Calendar (month/list); click a day or drag → new absence.
export default async function AbsencesPage({ searchParams }: PageProps<"/hr/absences">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("hr.manage")
  const focus = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? param(sp, "date")! : new Date().toISOString().slice(0, 10)
  const editId = param(sp, "edit")
  const creating = canManage && param(sp, "new") === "absence"
  const [{ data: rows }, { data: people }, { data: editing }] = await Promise.all([
    ctx.supabase
      .from("absences")
      .select("id, kind, starts_on, ends_on, half_day, note, employee_id, employees(name)")
      .eq("org_id", ctx.org.id)
      .lte("starts_on", addDays(focus, 45))
      .gte("ends_on", addDays(focus, -45))
      .order("starts_on"),
    canManage ? ctx.supabase.from("employees").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500) : Promise.resolve({ data: null }),
    canManage && editId ? ctx.supabase.from("absences").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const items: CalendarItem[] = (rows ?? []).map((a) => ({
    id: a.id,
    title: `${a.employees?.name ?? ""} · ${t.dynamic(`hr.kinds.${a.kind}`)}${a.half_day ? ` (${t("hr.halfDay")})` : ""}`,
    start: `${a.starts_on}T00:00:00`,
    end: `${addDays(a.ends_on, 1)}T00:00:00`,
    color: COLORS[a.kind],
    href: canManage ? withParams(sp, { edit: a.id, new: undefined }) : undefined,
    readOnly: true,
  }))
  const here = `/hr/absences${withParams(sp, { edit: undefined, new: undefined, start: undefined, end: undefined })}`
  const start = param(sp, "start")?.slice(0, 10) ?? ""
  const endRaw = param(sp, "end")
  // A drag/click ends at the next day's midnight: the absence's last day is the day before.
  const end = endRaw ? addDays(endRaw.slice(0, 10), endRaw.slice(11, 16) === "00:00" ? -1 : 0) : ""

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("hr.tabs.absences")}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <CalendarView events={items} views={["month", "agenda"]} defaultView="month" newHref={canManage ? withParams(sp, { new: "absence", edit: undefined }) : undefined} newMinutes={24 * 60} />
      {(creating || editing) && (
        <UrlSheet params={["new", "edit", "start", "end", "employee"]} title={editing ? t("hr.editAbsence") : t("hr.addAbsence")}>
          <Notice error={param(sp, "error")} />
          <form action={saveAbsence} className="grid gap-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="return" value={here} />
            <div className="grid gap-2">
              <Label htmlFor="ab-emp">{t("hr.employee")}</Label>
              <NativeSelect id="ab-emp" name="employee_id" required defaultValue={editing?.employee_id ?? param(sp, "employee") ?? ""} className="w-full">
                <NativeSelectOption value="" disabled>
                  {t("hr.pickEmployee")}
                </NativeSelectOption>
                {(people ?? []).map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ab-kind">{t("hr.kind")}</Label>
              <NativeSelect id="ab-kind" name="kind" defaultValue={editing?.kind ?? "vacation"} className="w-full">
                {ABSENCE_KINDS.map((k) => (
                  <NativeSelectOption key={k} value={k}>
                    {t.dynamic(`hr.kinds.${k}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ab-start">{t("hr.from")}</Label>
                <Input id="ab-start" name="starts_on" type="date" required defaultValue={editing?.starts_on ?? start} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ab-end">{t("hr.to")}</Label>
                <Input id="ab-end" name="ends_on" type="date" defaultValue={editing?.ends_on ?? end} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="half_day" value="1" defaultChecked={editing?.half_day ?? false} className="size-4" />
              {t("hr.halfDayLabel")}
            </label>
            <div className="grid gap-2">
              <Label htmlFor="ab-note">{t("hr.note")}</Label>
              <Input id="ab-note" name="note" maxLength={500} defaultValue={editing?.note ?? ""} />
            </div>
            {editing && <p className="text-sm text-muted-foreground">{t("hr.days", { count: absenceDays(editing) })}</p>}
            <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
          </form>
          {editing && (
            <form action={deleteAbsence}>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="return" value={here} />
              <SubmitButton variant="outline" size="sm">
                {t("hr.deleteAbsence")}
              </SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
