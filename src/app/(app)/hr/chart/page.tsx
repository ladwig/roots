import Link from "next/link"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"

type Person = { id: string; name: string; job_title: string | null; department: string | null; manager_id: string | null }

// Org chart from "reports to" (employees.manager_id): people without a manager are the top; cycles can't
// recurse forever (each person is shown once). Nested lists = readable on phones and for screen readers.
export default async function ChartPage() {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await ctx.supabase
    .from("employees")
    .select("id, name, job_title, department, manager_id")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order("name")
  const people = (data ?? []) as Person[]
  const ids = new Set(people.map((p) => p.id))
  const reports = (id: string | null) => people.filter((p) => (id ? p.manager_id === id : !p.manager_id || !ids.has(p.manager_id)))
  const seen = new Set<string>()

  const Node = ({ p }: { p: Person }) => {
    seen.add(p.id)
    const below = reports(p.id).filter((x) => !seen.has(x.id))
    return (
      <li className="grid gap-2">
        <Link href={`/hr/${p.id}`} className="grid w-fit min-w-48 gap-0.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted">
          <span className="font-medium">{p.name}</span>
          {(p.job_title || p.department) && <span className="text-xs text-muted-foreground">{[p.job_title, p.department].filter(Boolean).join(" · ")}</span>}
        </Link>
        {below.length > 0 && (
          <ul className="ml-4 grid gap-2 border-l pl-4">
            {below.map((x) => (
              <Node key={x.id} p={x} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const top = reports(null)
  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("hr.tabs.chart")}</h1>
      <p className="text-sm text-muted-foreground">{t("hr.chartHint")}</p>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hr.empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {(top.length ? top : people.slice(0, 1)).map((p) => (
            <Node key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}

export const instant = false
