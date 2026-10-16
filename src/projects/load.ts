// Data around tasks + projects for the App (boards, lists, panel, project page): columns of both boards, team (for
// assignees / lead), used tags, the open projects (for the task's project picker).
import type { getContext } from "@/lib/context"

type Ctx = Awaited<ReturnType<typeof getContext>>

export async function projectBasics(ctx: Ctx) {
  const [{ data: allStatuses }, { data: members }, { data: tagRows }, { data: projects }] = await Promise.all([
    ctx.supabase.from("task_statuses").select("id, name, color, is_done, position, scope").eq("org_id", ctx.org.id).order("position"),
    ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id),
    ctx.supabase.from("tasks").select("tags").eq("org_id", ctx.org.id).is("deleted_at", null).not("tags", "eq", "{}").limit(2000),
    // ponytail: all live projects for the picker (orgs have tens, not thousands); a search picker if that changes.
    ctx.supabase.from("projects").select("id, name, color, completed_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500),
  ])
  const { data: profiles } = members?.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", members.map((m) => m.user_id)) : { data: [] }
  const team = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "" })).sort((a, b) => a.name.localeCompare(b.name))
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b))
  const statuses = (allStatuses ?? []).filter((x) => x.scope === "task")
  const projectStatuses = (allStatuses ?? []).filter((x) => x.scope === "project")
  return { statuses, projectStatuses, team, tags, projects: projects ?? [] }
}

export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
