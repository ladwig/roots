import Link from "next/link"
import { Notice } from "@/components/notice"
import { UrlDialog } from "@/components/url-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { core, modules, type ModuleDef } from "@/modules/registry"
import { deleteRole, saveRole } from "./actions"

type Role = { id: string; name: string; permissions: string[]; is_owner: boolean }

export default async function RolesSettings({ searchParams }: PageProps<"/settings/roles">) {
  const ctx = await requirePerm("org.roles.manage")
  const sp = await searchParams
  const { data: roles } = await ctx.supabase
    .from("roles")
    .select("id, name, permissions, is_owner")
    .eq("org_id", ctx.org.id)
    .order("is_owner", { ascending: false })
    .order("name")
  const { data: members } = await ctx.supabase.from("org_members").select("role_id").eq("org_id", ctx.org.id)
  const memberCount = (id: string) => members?.filter((m) => m.role_id === id).length ?? 0

  const groups = [core, ...modules.filter((m) => ctx.modules.has(m.key))]
  const editing = roles?.find((r) => r.id === param(sp, "edit") && !r.is_owner)
  const creating = param(sp, "new") === "role"

  return (
    <div className="grid gap-4">
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">A role is a set of things people are allowed to do.</p>
        <Button render={<Link href="?new=role" scroll={false} />} nativeButton={false} size="sm">
          New role
        </Button>
      </div>
      <ul className="grid gap-2">
        {roles?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-muted-foreground">
                {summary(r)} · {memberCount(r.id)} {memberCount(r.id) === 1 ? "member" : "members"}
              </p>
            </div>
            {r.is_owner ? (
              <Badge variant="secondary">Can&apos;t be changed</Badge>
            ) : (
              <Button render={<Link href={`?edit=${r.id}`} scroll={false} />} nativeButton={false} variant="outline" size="sm">
                Edit
              </Button>
            )}
          </li>
        ))}
      </ul>

      {(editing || creating) && (
        <UrlDialog params={["edit", "new"]} title={editing ? `Edit ${editing.name}` : "New role"}>
          <RoleForm role={editing} groups={groups} error={param(sp, "error")} />
        </UrlDialog>
      )}
    </div>
  )
}

function summary(r: Role) {
  if (r.is_owner) return "Everything, including owners"
  if (r.permissions.includes("*")) return "Full access"
  if (!r.permissions.length) return "View only"
  return `${r.permissions.length} ${r.permissions.length === 1 ? "permission" : "permissions"}`
}

function RoleForm({ role, groups, error }: { role?: Role; groups: ModuleDef[]; error?: string }) {
  const has = new Set(role?.permissions ?? [])
  const shown = new Set(groups.flatMap((g) => g.permissions.map((p) => p.key)).concat("*"))
  // Keep permissions of modules that are currently off, so saving doesn't silently drop them.
  const hidden = [...has].filter((p) => !shown.has(p))

  return (
    <form action={saveRole.bind(null, role?.id ?? null)} className="grid gap-4">
      <Notice error={error} />
      <div className="grid gap-2">
        <Label htmlFor="role-name">Name</Label>
        <Input id="role-name" name="name" defaultValue={role?.name} required maxLength={50} />
      </div>
      <div className="grid max-h-[50vh] gap-4 overflow-y-auto pr-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="permissions" value="*" defaultChecked={has.has("*")} className="mt-0.5" />
          <span>
            <span className="font-medium">Full access</span>
            <span className="block text-muted-foreground">Everything except managing owners.</span>
          </span>
        </label>
        {groups.map((g) => (
          <fieldset key={g.key} className="grid gap-2">
            <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.name}</legend>
            {g.permissions.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <Checkbox name="permissions" value={p.key} defaultChecked={has.has(p.key)} />
                {p.label}
              </label>
            ))}
          </fieldset>
        ))}
        {hidden.map((p) => (
          <input key={p} type="hidden" name="permissions" value={p} />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit">Save role</Button>
        {role && (
          <Button type="submit" variant="destructive" formAction={deleteRole.bind(null, role.id)} formNoValidate>
            Delete role
          </Button>
        )}
      </div>
    </form>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
