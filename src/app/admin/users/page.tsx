import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
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
import { pageParam, param, withParams } from "@/lib/url"
import { deleteUser, removeMembership, setSuperadmin, updateProfile } from "./actions"

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const sp = await searchParams
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  const editId = param(sp, "edit")

  let query = supabase.rpc("admin_users").order("created_at", { ascending: false }).range(...pageRange(page))
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <>
      <h1 className="font-heading text-2xl font-semibold">{t("admin.users.title")}</h1>
      <Notice error={!editId ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />
      <SearchBox q={q} label={t("common.search")} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id })}
        empty={t("admin.users.empty")}
        columns={[
          {
            header: t("admin.users.email"),
            cell: (r) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{r.email}</span>
                {r.is_platform_admin && <Badge>{t("admin.users.superadmin")}</Badge>}
                {!r.confirmed && <Badge variant="outline">{t("admin.users.unconfirmed")}</Badge>}
              </span>
            ),
          },
          { header: t("admin.users.name"), cell: (r) => r.full_name ?? "–" },
          { header: t("admin.users.orgs"), cell: (r) => r.org_count, className: "tabular-nums" },
          { header: t("admin.users.lastSignIn"), cell: (r) => (r.last_sign_in_at ? t.date(r.last_sign_in_at) : t("admin.users.never")) },
          { header: t("common.created"), cell: (r) => t.date(r.created_at) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {editId && <EditUser t={t} userId={editId} error={param(sp, "error")} ok={param(sp, "ok")} />}
    </>
  )
}

async function EditUser({ t, userId, error, ok }: { t: T; userId: string; error?: string; ok?: string }) {
  const session = await requirePlatformAdmin()
  const { supabase } = session
  const [{ data: user }, { data: memberships }] = await Promise.all([
    supabase.rpc("admin_users").eq("id", userId).maybeSingle(),
    supabase.from("org_members").select("id, orgs(name, slug), roles(name)").eq("user_id", userId).order("created_at"),
  ])
  if (!user) return null
  const isMe = user.id === session.userId

  return (
    <UrlSheet params={["edit"]} title={user.full_name || user.email} description={user.email}>
      <Notice error={error} ok={ok} />

      <section className="grid gap-3">
        <h3 className="font-medium">{t("admin.users.profile")}</h3>
        <form action={updateProfile.bind(null, user.id)} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="full-name">{t("admin.users.name")}</Label>
            <Input id="full-name" name="full_name" defaultValue={user.full_name ?? ""} maxLength={100} />
          </div>
          <Button type="submit" className="justify-self-start">
            {t("common.save")}
          </Button>
        </form>
      </section>

      <section className="grid gap-2">
        <h3 className="font-medium">{t("admin.users.access")}</h3>
        <p className="text-sm text-muted-foreground">{t("admin.users.superadminHelp")}</p>
        {!isMe && (
          <form action={setSuperadmin.bind(null, user.id, !user.is_platform_admin)}>
            <Button type="submit" variant="outline">
              {user.is_platform_admin ? t("admin.users.revoke") : t("admin.users.grant")}
            </Button>
          </form>
        )}
        {isMe && <Badge className="justify-self-start">{t("admin.users.superadmin")}</Badge>}
      </section>

      <section className="grid gap-3">
        <h3 className="font-medium">{t("admin.users.memberships")}</h3>
        {memberships?.length ? (
          <ul className="grid divide-y rounded-lg border">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{m.orgs?.name}</span>
                  <span className="text-xs text-muted-foreground">{t.pick(m.roles?.name)}</span>
                </span>
                <form action={removeMembership.bind(null, user.id, m.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    {t("members.remove")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.users.noMemberships")}</p>
        )}
      </section>

      {!isMe && (
        <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
          <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
          <form action={deleteUser.bind(null, user.id)} className="grid gap-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="confirm" value="yes" className="mt-0.5" />
              {t("admin.users.deleteConfirm")}
            </label>
            <Button type="submit" variant="destructive" className="justify-self-start">
              {t("admin.users.delete")}
            </Button>
          </form>
        </section>
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
