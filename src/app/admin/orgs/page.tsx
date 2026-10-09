import Link from "next/link"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePlatformAdmin } from "@/lib/context"
import { pageParam, param, ROOT_DOMAIN, withParams } from "@/lib/url"
import { addMember, createOrg, deleteOrg, openOrg, removeMember, updateOrg } from "./actions"

export default async function AdminOrgs({ searchParams }: PageProps<"/admin/orgs">) {
  const { supabase } = await requirePlatformAdmin()
  const t = await getT()
  const sp = await searchParams
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const creating = param(sp, "new") === "org"

  let query = supabase
    .from("orgs")
    .select("id, name, slug, created_at, org_members(count)")
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
  const { data } = await query
  const rows = data?.slice(0, PAGE_SIZE) ?? []

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("admin.orgs.title")}</h1>
        <Button render={<Link href={withParams(sp, { new: "org", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
          {t("admin.orgs.new")}
        </Button>
      </div>
      <Notice error={!editId && !creating ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />
      <SearchBox q={q} label={t("common.search")} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={t("admin.orgs.empty")}
        columns={[
          { header: t("admin.orgs.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: t("admin.orgs.address"), cell: (r) => <span className="text-muted-foreground">{r.slug}</span> },
          { header: t("admin.orgs.members"), cell: (r) => r.org_members[0]?.count ?? 0, className: "tabular-nums" },
          { header: t("common.created"), cell: (r) => t.date(r.created_at) },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {creating && (
        <UrlSheet params={["new"]} title={t("admin.orgs.new")}>
          <form action={createOrg} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <div className="grid gap-2">
              <Label htmlFor="org-name">{t("admin.orgs.name")}</Label>
              <Input id="org-name" name="name" required maxLength={100} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-slug">{t("admin.orgs.address")}</Label>
              <Input id="org-slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" />
              <p className="text-xs text-muted-foreground">{t("onboarding.addressHelp")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-owner">{t("admin.orgs.owner")}</Label>
              <Input id="org-owner" name="owner" type="email" />
              <p className="text-xs text-muted-foreground">{t("admin.orgs.ownerHelp")}</p>
            </div>
            <Button type="submit">{t("admin.orgs.new")}</Button>
          </form>
        </UrlSheet>
      )}

      {editId && <EditOrg t={t} orgId={editId} error={param(sp, "error")} ok={param(sp, "ok")} />}
    </>
  )
}

async function EditOrg({ t, orgId, error, ok }: { t: T; orgId: string; error?: string; ok?: string }) {
  const { supabase } = await requirePlatformAdmin()
  const [{ data: org }, { data: members }, { data: roles }] = await Promise.all([
    supabase.from("orgs").select("id, name, slug").eq("id", orgId).maybeSingle(),
    supabase.from("org_members").select("id, user_id, roles(name)").eq("org_id", orgId).order("created_at"),
    supabase.from("roles").select("id, name, is_owner").or(`org_id.is.null,org_id.eq.${orgId}`).order("is_owner", { ascending: false }).order("created_at"),
  ])
  if (!org) return null
  const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", members?.map((m) => m.user_id) ?? [])
  const profile = new Map(profiles?.map((p) => [p.id, p]))

  return (
    <UrlSheet params={["edit"]} title={org.name} description={`${org.slug}.${ROOT_DOMAIN}`}>
      <Notice error={error} ok={ok} />
      <form action={openOrg.bind(null, org.id)}>
        <Button type="submit" variant="outline" className="w-full">
          {t("admin.orgs.open")}
        </Button>
      </form>

      <section className="grid gap-3">
        <h3 className="font-medium">{t("admin.orgs.details")}</h3>
        <form action={updateOrg.bind(null, org.id)} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">{t("admin.orgs.name")}</Label>
            <Input id="edit-name" name="name" defaultValue={org.name} required maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-slug">{t("admin.orgs.address")}</Label>
            <Input id="edit-slug" name="slug" defaultValue={org.slug} required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" />
          </div>
          <Button type="submit" className="justify-self-start">
            {t("common.save")}
          </Button>
        </form>
      </section>

      <section className="grid gap-3">
        <h3 className="font-medium">{t("admin.orgs.members")}</h3>
        {members?.length ? (
          <ul className="grid divide-y rounded-lg border">
            {members.map((m) => {
              const p = profile.get(m.user_id)
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{p?.full_name || p?.email}</span>
                    <span className="text-xs text-muted-foreground">{t.pick(m.roles?.name)}</span>
                  </span>
                  <form action={removeMember.bind(null, org.id, m.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {t("members.remove")}
                    </Button>
                  </form>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.orgs.noMembers")}</p>
        )}
        <form action={addMember.bind(null, org.id)} className="grid gap-2 rounded-lg border p-3">
          <Label htmlFor="add-email">{t("admin.orgs.addMember")}</Label>
          <Input id="add-email" name="email" type="email" required placeholder={t("members.email")} />
          <div className="flex gap-2">
            <NativeSelect name="role_id" aria-label={t("members.role")} className="flex-1">
              {roles?.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {t.pick(r.name)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit">{t("admin.orgs.add")}</Button>
          </div>
        </form>
      </section>

      <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
        <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
        <form action={deleteOrg.bind(null, org.id)} className="grid gap-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="confirm" value="yes" className="mt-0.5" />
            {t("admin.orgs.deleteConfirm")}
          </label>
          <Button type="submit" variant="destructive" className="justify-self-start">
            {t("admin.orgs.delete")}
          </Button>
        </form>
      </section>
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
