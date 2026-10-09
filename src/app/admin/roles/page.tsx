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
import { requirePlatformAdmin } from "@/lib/context"
import { roleSummary } from "@/lib/roles"
import { param, withParams } from "@/lib/url"
import { core, modules } from "@/modules/registry"
import { deleteRole, saveRole } from "./actions"
import { SubmitButton } from "@/components/submit-button"

type Role = { id: string; name: unknown; permissions: string[]; is_owner: boolean }

export default async function AdminRoles({ searchParams }: PageProps<"/admin/roles">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const sp = await searchParams
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, permissions, is_owner, org_members(count)")
    .is("org_id", null)
    .order("is_owner", { ascending: false })
    .order("created_at")
  const editing = roles?.find((r) => r.id === param(sp, "edit"))
  const creating = param(sp, "new") === "role"

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("admin.roles.title")}</h1>
        <Button render={<Link href={withParams(sp, { new: "role", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
          {t("admin.roles.new")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("admin.roles.intro")}</p>
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={roles ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={t("roles.empty")}
        columns={[
          {
            header: t("roles.name"),
            cell: (r) => (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.pick(r.name)}</span>
                {r.is_owner && <Badge variant="secondary">{t("admin.roles.ownerBadge")}</Badge>}
              </span>
            ),
          },
          { header: t("roles.permissions"), cell: (r) => roleSummary(t, r) },
          { header: t("admin.roles.inOrgs"), cell: (r) => r.org_members[0]?.count ?? 0, className: "tabular-nums" },
        ]}
      />

      {(editing || creating) && (
        <UrlSheet params={["edit", "new"]} title={editing ? t("roles.editTitle", { name: t.pick(editing.name) }) : t("admin.roles.new")}>
          <RoleForm t={t} role={editing} error={param(sp, "error")} />
        </UrlSheet>
      )}
    </>
  )
}

function RoleForm({ t, role, error }: { t: T; role?: Role; error?: string }) {
  const has = new Set(role?.permissions ?? [])
  const names = (role?.name ?? {}) as Record<string, string>
  const groups = [core, ...modules]
  const known = new Set(groups.flatMap((g) => g.permissions).concat("*", ...groups.map((g) => `${g.key}.*`)))
  // Keep permissions the registry doesn't know (anymore), so saving doesn't silently drop them.
  const hidden = [...has].filter((p) => !known.has(p))

  return (
    <form action={saveRole.bind(null, role?.id ?? null)} className="grid gap-4">
      <Notice error={error} />
      <div className="grid gap-2">
        <Label htmlFor="name-de">{t("admin.roles.nameDe")}</Label>
        <Input id="name-de" name="name_de" defaultValue={names.de} required maxLength={50} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name-en">{t("admin.roles.nameEn")}</Label>
        <Input id="name-en" name="name_en" defaultValue={names.en} maxLength={50} />
      </div>
      {role?.is_owner ? (
        <>
          <input type="hidden" name="owner" value="1" />
          <p className="text-sm text-muted-foreground">{t("roles.summaryOwner")}</p>
        </>
      ) : (
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
                  <Checkbox name="permissions" value={p} defaultChecked={has.has(p) || has.has(`${g.key}.*`)} />
                  {t.dynamic(`permissions.${p}`)}
                </label>
              ))}
            </fieldset>
          ))}
          {hidden.map((p) => (
            <input key={p} type="hidden" name="permissions" value={p} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <SubmitButton>{t("roles.save")}</SubmitButton>
        {role && !role.is_owner && (
          <SubmitButton variant="destructive" formAction={deleteRole.bind(null, role.id)} formNoValidate>
            {t("roles.delete")}
          </SubmitButton>
        )}
      </div>
    </form>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
