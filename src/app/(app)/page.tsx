import Link from "next/link"
import { ChevronRightIcon, SunIcon } from "lucide-react"
import { FormCard, Page, PageHeader } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { renderEvent } from "@/events/render"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { titled } from "@/lib/title"
import { param } from "@/lib/url"
import { TaskDrawer } from "./projects/task-drawer"

export const generateMetadata = titled("shell.home")

const none = Promise.resolve({ data: null })

// "Heute": what needs this person now, one card per area they use (tasks, shifts, events, dues, inbox). Cards of
// modules that are off or not allowed don't show; an empty card says so in one line.
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const on = (m: string, p: string) => ctx.modules.has(m) && ctx.can(p)
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const [{ data: tasks }, shifts, { data: events }, { data: overdue }, { data: inbox }] = await Promise.all([
    on("projects", "projects.view")
      ? ctx.supabase
          .from("tasks")
          .select("id, title, due_on, task_assignees!inner(user_id)")
          .eq("org_id", ctx.org.id)
          .eq("task_assignees.user_id", ctx.userId)
          .is("completed_at", null)
          .is("deleted_at", null)
          .order("due_on", { nullsFirst: false })
          .limit(6)
      : none,
    on("shifts", "shifts.self")
      ? ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id }).then(({ data: staffId }) =>
          staffId
            ? ctx.supabase
                .from("shift_assignments")
                .select("status, shifts!inner(id, title, starts_at, ends_at, positions(name))")
                .eq("staff_id", staffId)
                .eq("status", "assigned")
                .gte("shifts.ends_at", now)
                .then(({ data }) => (data ?? []).map((a) => a.shifts).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4))
            : null,
        )
      : Promise.resolve(null),
    on("events", "events.view")
      ? ctx.supabase.from("events").select("id, title, starts_at, status").eq("org_id", ctx.org.id).is("deleted_at", null).neq("status", "cancelled").gte("starts_at", now).order("starts_at").limit(4)
      : none,
    on("members", "members.view") ? ctx.supabase.from("member_dues").select("amount_cents").eq("org_id", ctx.org.id).eq("status", "open").lt("due_on", today).limit(5000) : none,
    ctx.supabase.from("notifications").select("id, created_at, events:hub_events(type, payload)").eq("user_id", ctx.userId).is("read_at", null).order("created_at", { ascending: false }).limit(5),
  ])
  const day = (v: string) => t.date(v, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  const overdueSum = (overdue ?? []).reduce((s, d) => s + d.amount_cents, 0)

  return (
    <Page>
      <PageHeader icon={SunIcon} title={t("home.today")} meta={`${ctx.org.name} · ${t.date(now, { dateStyle: "full" })}`} />
      <div className="grid gap-6 md:grid-cols-2">
        {tasks && (
          <FormCard id="tasks" title={t("home.myTasks")} action={<More href="/projects/tasks?assignee=me&view=list" label={t("home.all")} />}>
            <Rows
              empty={t("home.noTasks")}
              rows={tasks.map((x) => ({
                key: x.id,
                href: `/?task=${x.id}`,
                title: x.title,
                detail: x.due_on ? t.date(`${x.due_on}T12:00:00`, { weekday: "short", day: "numeric", month: "short" }) : "",
                warn: !!x.due_on && x.due_on < today,
              }))}
            />
          </FormCard>
        )}
        {shifts && (
          <FormCard id="shifts" title={t("home.myShifts")} action={<More href="/shifts/me" label={t("home.all")} />}>
            <Rows empty={t("home.noShifts")} rows={shifts.map((s) => ({ key: s.id, href: "/shifts/me", title: s.title || s.positions?.name || t("shifts.title"), detail: day(s.starts_at) }))} />
          </FormCard>
        )}
        {events && (
          <FormCard id="events" title={t("home.nextEvents")} action={<More href="/events" label={t("home.all")} />}>
            <Rows
              empty={t("home.noEvents")}
              rows={events.map((e) => ({ key: e.id, href: `/events/${e.id}`, title: e.title, detail: day(e.starts_at), badge: e.status === "draft" ? t("eventsPage.statuses.draft") : undefined }))}
            />
          </FormCard>
        )}
        {overdue && (
          <FormCard id="dues" title={t("home.overdueDues")} action={<More href="/members/dues" label={t("home.all")} />}>
            {overdue.length ? (
              <p className="text-sm">
                <span className="text-2xl font-semibold tabular-nums text-destructive">{t.money(overdueSum)}</span>
                <span className="ml-2 text-muted-foreground">{t("home.overdueCount", { count: overdue.length })}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("home.noOverdue")}</p>
            )}
          </FormCard>
        )}
        <FormCard id="inbox" title={t("inbox.title")} action={<More href="/notifications" label={t("home.all")} />}>
          <Rows
            empty={t("home.inboxEmpty")}
            rows={(inbox ?? []).map((n) => ({ key: String(n.id), href: `/notifications/${n.id}`, title: n.events ? renderEvent(n.events, t.locale).title : "–", detail: t.date(n.created_at, { dateStyle: "short", timeStyle: "short" }) }))}
          />
        </FormCard>
      </div>
      <TaskDrawer ctx={ctx} t={t} id={param(sp, "task")} back="/" error={param(sp, "error")} ok={param(sp, "ok")} />
    </Page>
  )
}

function More({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
      {label} <ChevronRightIcon className="size-4" />
    </Link>
  )
}

function Rows({ rows, empty }: { rows: { key: string; href: string; title: string; detail: string; badge?: string; warn?: boolean }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="-mx-2 grid">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
            <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
            {r.badge && <Badge variant="outline">{r.badge}</Badge>}
            <span className={r.warn ? "shrink-0 text-xs font-medium text-destructive" : "shrink-0 text-xs text-muted-foreground"}>{r.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
