import { DataTable } from "@/components/data-table"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { grantedByModule, roleSummary } from "@/lib/roles"
import { param, withParams } from "@/lib/url"

// Read-only: roles are defined by platform admins (/admin/roles); orgs assign them under Members.
export default async function RolesSettings({ searchParams }: PageProps<"/settings/roles">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const [{ data: roles }, { data: members }] = await Promise.all([
    ctx.supabase
      .from("roles")
      .select("id, name, permissions, is_owner")
      .or(`org_id.is.null,org_id.eq.${ctx.org.id}`)
      .order("is_owner", { ascending: false })
      .order("created_at"),
    ctx.supabase.from("org_members").select("role_id").eq("org_id", ctx.org.id),
  ])
  const memberCount = (id: string) => members?.filter((m) => m.role_id === id).length ?? 0
  const viewing = roles?.find((r) => r.id === param(sp, "view"))

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("roles.intro")}</p>
      <DataTable
        rows={roles ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { view: r.id })}
        empty={t("roles.empty")}
        columns={[
          { header: t("roles.name"), cell: (r) => <span className="font-medium">{t.pick(r.name)}</span> },
          { header: t("roles.permissions"), cell: (r) => roleSummary(t, r) },
          { header: t("roles.members"), cell: (r) => memberCount(r.id), className: "tabular-nums" },
        ]}
      />

      {viewing && (
        <UrlSheet params={["view"]} title={t.pick(viewing.name)} description={t("roles.canDo")}>
          {grantedByModule(viewing).length ? (
            grantedByModule(viewing)
              .filter((g) => g.key === "org" || ctx.modules.has(g.key))
              .map((g) => (
                <section key={g.key} className="grid gap-1.5">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.dynamic(`modules.${g.key}.name`)}</h3>
                  <ul className="grid gap-1 text-sm">
                    {g.permissions.map((p) => (
                      <li key={p}>{t.dynamic(`permissions.${p}`)}</li>
                    ))}
                  </ul>
                </section>
              ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("roles.summaryViewOnly")}</p>
          )}
        </UrlSheet>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
