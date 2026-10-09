import Link from "next/link"
import { Notice } from "@/components/notice"
import { SubmitOnChangeSelect } from "@/components/submit-on-change"
import { UrlDialog } from "@/components/url-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { changeRole, removeMember, revokeInvite } from "./actions"
import { InviteForm } from "./invite-form"

export default async function MembersSettings({ searchParams }: PageProps<"/settings/members">) {
  const ctx = await getContext()
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("org.members.manage")
  const db = ctx.supabase

  const [{ data: members }, { data: roles }, { data: invites }] = await Promise.all([
    db.from("org_members").select("id, user_id, role_id").eq("org_id", ctx.org.id).order("created_at"),
    db.from("roles").select("id, name, is_owner, permissions").eq("org_id", ctx.org.id).order("name"),
    canManage
      ? db.from("invites").select("id, email, role_id, expires_at").eq("org_id", ctx.org.id).is("accepted_at", null)
      : Promise.resolve({ data: [] }),
  ])
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("id", members?.map((m) => m.user_id) ?? [])
  const profile = new Map(profiles?.map((p) => [p.id, p]))
  const roleName = new Map(roles?.map((r) => [r.id, r.name]))
  // Only owners can hand out the owner role.
  const assignable = roles?.filter((r) => ctx.role.is_owner || !r.is_owner) ?? []
  // New people default to the role with the fewest permissions.
  const defaultRole = assignable.filter((r) => !r.is_owner).sort((a, b) => a.permissions.length - b.permissions.length)[0]

  return (
    <div className="grid gap-6">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">{t("members.heading")}</h2>
          {canManage && (
            <Button render={<Link href="?new=invite" scroll={false} />} nativeButton={false} size="sm">
              {t("members.invite")}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("members.person")}</TableHead>
                <TableHead>{t("members.role")}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((m) => {
                const p = profile.get(m.user_id)
                const isMe = m.user_id === ctx.userId
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{p?.full_name || p?.email}</div>
                      {p?.full_name && <div className="text-xs text-muted-foreground">{p.email}</div>}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <form action={changeRole}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <SubmitOnChangeSelect name="role_id" defaultValue={m.role_id} aria-label={t("members.role")} size="sm">
                            {(assignable.some((r) => r.id === m.role_id) ? assignable : roles ?? []).map((r) => (
                              <NativeSelectOption key={r.id} value={r.id}>
                                {r.name}
                              </NativeSelectOption>
                            ))}
                          </SubmitOnChangeSelect>
                        </form>
                      ) : (
                        roleName.get(m.role_id)
                      )}
                    </TableCell>
                    <TableCell>
                      {(canManage || isMe) && (
                        <form action={removeMember.bind(null, m.id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            {isMe ? t("members.leave") : t("members.remove")}
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {canManage && !!invites?.length && (
        <section className="grid gap-3">
          <h2 className="font-medium">{t("members.openInvites")}</h2>
          <ul className="grid gap-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0 truncate">{i.email}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{roleName.get(i.role_id)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("members.expires", { date: t.date(i.expires_at) })}
                  </span>
                  <form action={revokeInvite.bind(null, i.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t("members.revoke")}
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && param(sp, "new") === "invite" && (
        <UrlDialog params={["new"]} title={t("members.dialogTitle")} description={t("members.dialogDescription")}>
          <InviteForm roles={assignable} defaultRoleId={defaultRole?.id} />
        </UrlDialog>
      )}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
