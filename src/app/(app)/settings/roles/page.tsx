import Link from "next/link"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { core, modules, type ModuleDef } from "@/modules/registry"
import { deleteRole, saveRole } from "./actions"

type Role = { id: string; name: string; permissions: string[]; is_owner: boolean }

export default async function RolesSettings({ searchParams }: PageProps<"/settings/roles">) {
  const ctx = await requirePerm("org.roles.manage")
  const t = await getT()
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
        <p className="text-sm text-muted-foreground">{t("roles.intro")}</p>
        <Button render={<Link href={withParams(sp, { new: "role", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
          {t("roles.new")}
        </Button>
      </div>
      <DataTable
        rows={roles ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => (r.is_owner ? undefined : withParams(sp, { edit: r.id, new: undefined }))}
        empty={t("roles.empty")}
        columns={[
          {
            header: t("roles.name"),
            cell: (r) => (
              <span className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {r.is_owner && <Badge variant="secondary">{t("roles.locked")}</Badge>}
              </span>
            ),
          },
          { header: t("roles.permissions"), cell: (r) => summary(t, r) },
          { header: t("roles.members"), cell: (r) => memberCount(r.id), className: "tabular-nums" },
        ]}
      />

      {(editing || creating) && (
        <UrlSheet params={["edit", "new"]} title={editing ? t("roles.editTitle", { name: editing.name }) : t("roles.new")}>
          <RoleForm t={t} role={editing} groups={groups} error={param(sp, "error")} />
        </UrlSheet>
      )}
    </div>
  )
}

function summary(t: T, r: Role) {
  if (r.is_owner) return t("roles.summaryOwner")
  if (r.permissions.includes("*")) return t("roles.summaryFull")
  if (!r.permissions.length) return t("roles.summaryViewOnly")
  return t("roles.permissionCount", { count: r.permissions.length })
}

function RoleForm({ t, role, groups, error }: { t: T; role?: Role; groups: ModuleDef[]; error?: string }) {
  const has = new Set(role?.permissions ?? [])
  const shown = new Set(groups.flatMap((g) => g.permissions).concat("*"))
  // Keep permissions of modules that are currently off, so saving doesn't silently drop them.
  const hidden = [...has].filter((p) => !shown.has(p))

  return (
    <form action={saveRole.bind(null, role?.id ?? null)} className="grid gap-4">
      <Notice error={error} />
      <div className="grid gap-2">
        <Label htmlFor="role-name">{t("roles.name")}</Label>
        <Input id="role-name" name="name" defaultValue={role?.name} required maxLength={50} />
      </div>
      <div className="grid gap-4">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="permissions" value="*" defaultChecked={has.has("*")} className="mt-0.5" />
          <span>
            <span className="font-medium">{t("roles.fullAccess")}</span>
            <span className="block text-muted-foreground">{t("roles.fullAccessHelp")}</span>
          </span>
        </label>
        {groups.map((g) => (
          <fieldset key={g.key} className="grid gap-2">
            <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t.dynamic(`modules.${g.key}.name`)}
            </legend>
            {g.permissions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Checkbox name="permissions" value={p} defaultChecked={has.has(p)} />
                {t.dynamic(`permissions.${p}`)}
              </label>
            ))}
          </fieldset>
        ))}
        {hidden.map((p) => (
          <input key={p} type="hidden" name="permissions" value={p} />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit">{t("roles.save")}</Button>
        {role && (
          <Button type="submit" variant="destructive" formAction={deleteRole.bind(null, role.id)} formNoValidate>
            {t("roles.delete")}
          </Button>
        )}
      </div>
    </form>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
