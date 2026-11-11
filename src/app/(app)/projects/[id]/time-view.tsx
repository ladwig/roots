import Link from "next/link"
import { PlayIcon, PlusIcon, SquareIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { FormCard } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, TIME_COLS, TimeEntryForm, TimeEntryList, type TimeRow } from "@/components/time-entries"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { minutes } from "@/shifts/time"
import { clock } from "../../shifts/time-actions"

type Ctx = Awaited<ReturnType<typeof getContext>>

/** Who may use the project's time tab: the shifts module (time tracking) is on and the person tracks or sees time. */
export const canTrackTime = (ctx: Ctx) => ctx.modules.has("shifts") && ["shifts.self", "shifts.view", "shifts.manage", "shifts.approve"].some((p) => ctx.can(p))

/**
 * Time on one project (?view=time): hours in total and per person, the entries (everyone's for shifts.view/approve,
 * else your own, RLS), clock in/out on this project, add/edit entries in a drawer (?time=new | <id>).
 */
export async function ProjectTime({ ctx, t, sp, base, projectId }: { ctx: Ctx; t: T; sp: SearchParams; base: string; projectId: string }) {
  const here = `${base}?view=time`
  const [{ data: rows }, { data: staffRows }, { data: me }, { data: tasks }] = await Promise.all([
    ctx.supabase.from("time_entries").select(TIME_COLS).eq("org_id", ctx.org.id).eq("project_id", projectId).order("started_at", { ascending: false }).limit(500), // ponytail: newest 500, a month filter when projects get that long
    ctx.supabase.from("staff").select("id, name").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id }),
    ctx.supabase.from("tasks").select("id, title").eq("org_id", ctx.org.id).eq("project_id", projectId).is("deleted_at", null).order("title").limit(500),
  ])
  const myStaff = (me as string | null) ?? null
  const { data: running } = myStaff ? await ctx.supabase.from("time_entries").select("id, started_at, project_id, projects(name)").eq("staff_id", myStaff).is("ended_at", null).maybeSingle() : { data: null }
  const entries = (rows ?? []) as TimeRow[]
  const people = new Map((staffRows ?? []).map((s) => [s.id, s.name]))
  const manager = ctx.can("shifts.manage") || ctx.can("shifts.approve")
  const self = ctx.can("shifts.self") && !!myStaff
  const done = entries.filter((e) => e.ended_at)
  const total = done.reduce((s, e) => s + minutes(e).net, 0)
  const perPerson = [...done.reduce((m, e) => m.set(e.staff_id, (m.get(e.staff_id) ?? 0) + minutes(e).net), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const editable = (e: TimeRow) => manager || (self && e.staff_id === myStaff && !e.approved_at)
  const open = param(sp, "time")
  const editing = open && open !== "new" ? entries.find((e) => e.id === open && editable(e)) : null
  const elsewhere = running && running.project_id !== projectId

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <Notice error={!open ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
        {(self || manager) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
            {self && (
              <form action={clock}>
                <input type="hidden" name="return" value={here} />
                {!running && <input type="hidden" name="project_id" value={projectId} />}
                <SubmitButton variant={running ? "default" : "outline"}>
                  {running ? <SquareIcon /> : <PlayIcon />}
                  {running ? t("time.clockOut") : t("time.clockInProject")}
                </SubmitButton>
              </form>
            )}
            {self && (
              <p className="text-sm text-muted-foreground">
                {running
                  ? elsewhere
                    ? t("time.runningOn", { project: running.projects?.name ?? t("time.noProject"), time: t.date(running.started_at, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })
                    : t("time.since", { time: t.date(running.started_at, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })
                  : t("time.clockHintProject")}
              </p>
            )}
            <Button render={<Link href={withParams(sp, { time: "new" })} />} nativeButton={false} size="sm" variant="ghost" className="ml-auto">
              <PlusIcon /> {t("time.add")}
            </Button>
          </div>
        )}
        <TimeEntryList rows={entries} people={people} hideProject editHref={(id) => (editable(entries.find((e) => e.id === id)!) ? withParams(sp, { time: id }) : null)} />
      </div>
      <aside className="grid min-w-0 gap-6">
        <FormCard title={t("time.projectTotal")}>
          <p className="text-2xl font-semibold tabular-nums">{hoursText(t, total)}</p>
          {perPerson.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {perPerson.map(([sid, min]) => (
                <li key={sid} className="flex justify-between gap-2">
                  <span className="truncate">{people.get(sid) ?? "–"}</span>
                  <span className="tabular-nums text-muted-foreground">{hoursText(t, min)}</span>
                </li>
              ))}
            </ul>
          )}
        </FormCard>
      </aside>
      {(open === "new" && (self || manager)) || editing ? (
        <UrlSheet params={["time"]} title={editing ? t("time.edit") : t("time.add")}>
          <Notice error={param(sp, "error")} />
          <TimeEntryForm
            entry={editing}
            returnTo={here}
            canDelete={!!editing}
            projectId={projectId}
            tasks={tasks ?? []}
            staff={manager ? (staffRows ?? []) : undefined}
            staffId={manager ? (myStaff ?? staffRows?.[0]?.id) : undefined}
          />
        </UrlSheet>
      ) : null}
    </div>
  )
}
