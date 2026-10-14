import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"
import { deleteStatusAction, moveStatusAction, saveStatusAction } from "../actions"

type Status = { id: string; name: string; color: string; is_done: boolean }

// Board columns: name, colour dot, "counts as done". Order with up/down; a column can be deleted while it's empty.
export default async function ProjectsSetupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  const sp = await searchParams
  const { data } = await ctx.supabase.from("task_statuses").select("id, name, color, is_done").eq("org_id", ctx.org.id).order("position")
  const statuses = data ?? []

  const row = (s: Status | null, i: number) => (
    <div key={s?.id ?? "new"} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <form action={saveStatusAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {s && <input type="hidden" name="id" value={s.id} />}
        <fieldset className="flex gap-1" aria-label={t("projects.color")}>
          {PICKABLE_COLORS.map((c) => (
            <label key={c} className="grid size-7 cursor-pointer place-items-center rounded-full has-checked:ring-2 has-checked:ring-ring">
              <input type="radio" name="color" value={c} defaultChecked={(s?.color ?? "gray") === c} className="sr-only" aria-label={t.dynamic(`projects.colors.${c}`)} />
              <span className="size-3.5 rounded-full" style={{ background: DOT[c] }} aria-hidden />
            </label>
          ))}
        </fieldset>
        <Input name="name" defaultValue={s?.name} placeholder={s ? undefined : t("projects.newStatus")} aria-label={t("projects.statusName")} maxLength={60} required className="h-8 w-44 flex-1" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="is_done" defaultChecked={s?.is_done} className="size-4 accent-primary" /> {t("projects.isDone")}
        </label>
        <SubmitButton size="sm" variant={s ? "outline" : "default"}>{s ? t("common.save") : t("projects.add")}</SubmitButton>
      </form>
      {s && (
        <div className="flex gap-1">
          {(["up", "down"] as const).map((dir) => (
            <form key={dir} action={moveStatusAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="dir" value={dir} />
              <SubmitButton size="icon-sm" variant="ghost" aria-label={t.dynamic(`projects.move.${dir}`)} disabled={dir === "up" ? i === 0 : i === statuses.length - 1}>
                {dir === "up" ? <ArrowUpIcon /> : <ArrowDownIcon />}
              </SubmitButton>
            </form>
          ))}
          <form action={deleteStatusAction}>
            <input type="hidden" name="id" value={s.id} />
            <SubmitButton size="icon-sm" variant="ghost" aria-label={t("projects.deleteStatus")} disabled={statuses.length <= 1} className="text-destructive hover:text-destructive">
              <Trash2Icon />
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  )

  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/projects", label: t("projects.title") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <FormCard id="columns" title={t("projects.columns")} description={t("projects.setupHint")}>
        {statuses.map(row)}
        {row(null, -1)}
      </FormCard>
    </Page>
  )
}

export const instant = false
