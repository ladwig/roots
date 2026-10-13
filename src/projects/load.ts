// Data around tasks for the App (board, list, panel, task page): columns, team (for assignees), used tags.
import type { getContext } from "@/lib/context"

type Ctx = Awaited<ReturnType<typeof getContext>>

export async function projectBasics(ctx: Ctx) {
  const [{ data: statuses }, { data: members }, { data: tagRows }] = await Promise.all([
    ctx.supabase.from("task_statuses").select("id, name, color, is_done, position").eq("org_id", ctx.org.id).order("position"),
    ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
    ctx.supabase.from("tasks").select("tags").eq("org_id", ctx.org.id).is("deleted_at", null).not("tags", "eq", "{}").limit(2000),
  ])
  const { data: profiles } = members?.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", members.map((m) => m.user_id)) : { data: [] }
  const team = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "" })).sort((a, b) => a.name.localeCompare(b.name))
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b))
  return { statuses: statuses ?? [], team, tags }
}

export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
