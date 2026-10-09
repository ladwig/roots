import Link from "next/link"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { changeRole, removeMember, revokeInvite } from "./actions"
import { InviteForm } from "./invite-form"

export default async function MembersSettings({ searchParams }: PageProps<"/settings/members">) {
  const ctx = await getContext()
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("org.members.manage")
  const db = ctx.supabase

  const [{ data: members }, { data: roles }, { data: invites }] = await Promise.all([
    db.from("org_members").select("id, user_id, role_id, created_at").eq("org_id", ctx.org.id).order("created_at"),
    db.from("roles").select("id, name, is_owner, permissions").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).order("is_owner", { ascending: false }).order("created_at"),
    canManage
      ? db.from("invites").select("id, email, role_id, expires_at").eq("org_id", ctx.org.id).is("accepted_at", null).order("created_at")
      : Promise.resolve({ data: [] }),
  ])
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("id", members?.map((m) => m.user_id) ?? [])
  const profile = new Map(profiles?.map((p) => [p.id, p]))
  const roleName = new Map(roles?.map((r) => [r.id, t.pick(r.name)]))
  // Only owners can hand out the owner role.
  const assignable = roles?.filter((r) => ctx.role.is_owner || !r.is_owner).map((r) => ({ ...r, name: t.pick(r.name) })) ?? []
  // New people default to the role with the fewest permissions.
  const defaultRole = assignable.filter((r) => !r.is_owner).sort((a, b) => a.permissions.length - b.permissions.length)[0]

  const editing = members?.find((m) => m.id === param(sp, "edit"))
  const inviting = canManage && param(sp, "new") === "invite"

  return (
    <div className="grid gap-6">
      <Notice error={!editing && !inviting ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">{t("members.heading")}</h2>
          {canManage && (
            <Button render={<Link href={withParams(sp, { new: "invite", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
              {t("members.invite")}
            </Button>
          )}
        </div>
        <DataTable
          rows={members ?? []}
          rowKey={(m) => m.id}
          rowHref={(m) => (canManage || m.user_id === ctx.userId ? withParams(sp, { edit: m.id, new: undefined }) : undefined)}
          empty={t("members.emptyMembers")}
          columns={[
            {
              header: t("members.person"),
              cell: (m) => {
                const p = profile.get(m.user_id)
                return (
                  <span className="grid">
                    <span className="font-medium">{p?.full_name || p?.email}</span>
                    {p?.full_name && <span className="text-xs text-muted-foreground">{p.email}</span>}
                  </span>
                )
              },
            },
            { header: t("members.role"), cell: (m) => roleName.get(m.role_id) },
            { header: t("members.joined"), cell: (m) => t.date(m.created_at) },
          ]}
        />
      </section>

      {canManage && (
        <section className="grid gap-3">
          <h2 className="font-medium">{t("members.openInvites")}</h2>
          <DataTable
            rows={invites ?? []}
            rowKey={(i) => i.id}
            empty={t("members.invitesEmpty")}
            columns={[
              { header: t("members.email"), cell: (i) => i.email },
              { header: t("members.role"), cell: (i) => <Badge variant="secondary">{roleName.get(i.role_id)}</Badge> },
              { header: t("members.expiresHeader"), cell: (i) => t.date(i.expires_at) },
              {
                header: "",
                className: "w-0 text-right",
                cell: (i) => (
                  <form action={revokeInvite.bind(null, i.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t("members.revoke")}
                    </Button>
                  </form>
                ),
              },
            ]}
          />
        </section>
      )}

      {editing && (
        <UrlSheet
          params={["edit"]}
          title={profile.get(editing.user_id)?.full_name || profile.get(editing.user_id)?.email || t("members.editTitle")}
          description={profile.get(editing.user_id)?.email}
        >
          <Notice error={param(sp, "error")} />
          {canManage && (
            <form action={changeRole} className="grid gap-3">
              <input type="hidden" name="member_id" value={editing.id} />
              <div className="grid gap-2">
                <Label htmlFor="member-role">{t("members.role")}</Label>
                <NativeSelect id="member-role" name="role_id" defaultValue={editing.role_id}>
                  {(assignable.some((r) => r.id === editing.role_id) ? assignable : (roles ?? []).map((r) => ({ ...r, name: t.pick(r.name) }))).map((r) => (
                    <NativeSelectOption key={r.id} value={r.id}>
                      {r.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit" className="justify-self-start">
                {t("common.save")}
              </Button>
            </form>
          )}
          <form action={removeMember.bind(null, editing.id)}>
            <Button type="submit" variant="destructive">
              {editing.user_id === ctx.userId ? t("members.leave") : t("members.remove")}
            </Button>
          </form>
        </UrlSheet>
      )}

      {inviting && (
        <UrlSheet params={["new"]} title={t("members.dialogTitle")} description={t("members.dialogDescription")}>
          <InviteForm roles={assignable} defaultRoleId={defaultRole?.id} />
        </UrlSheet>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
