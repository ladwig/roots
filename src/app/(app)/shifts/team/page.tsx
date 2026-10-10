import Link from "next/link"
import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { saveStaff } from "../actions"

export default async function TeamPage({ searchParams }: PageProps<"/shifts/team">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shifts.manage")
  const [{ data: staff }, { data: positions }, { data: members }] = await Promise.all([
    ctx.supabase.from("staff").select("*").eq("org_id", ctx.org.id).order("active", { ascending: false }).order("name"),
    ctx.supabase.from("positions").select("id, name").eq("org_id", ctx.org.id).order("position").order("name"),
    canManage ? ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id) : Promise.resolve({ data: [] }),
  ])
  const { data: profiles } = members?.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", members.map((m) => m.user_id))
    : { data: [] }
  const editing = canManage ? staff?.find((s) => s.id === param(sp, "edit")) : undefined
  const creating = canManage && param(sp, "new") === "staff"
  const posName = new Map(positions?.map((p) => [p.id, p.name]))
  const memberName = (u: string) => {
    const p = profiles?.find((x) => x.id === u)
    return p?.full_name || p?.email || ""
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("shifts.tabs.team")}</h1>
        {canManage && (
          <Button render={<Link href={withParams(sp, { new: "staff", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
            {t("shifts.newStaff")}
          </Button>
        )}
      </div>
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={staff ?? []}
        rowKey={(s) => s.id}
        rowHref={canManage ? (s) => withParams(sp, { edit: s.id, new: undefined }) : undefined}
        empty={t("shifts.noStaff")}
        columns={[
          {
            header: t("shifts.name"),
            cell: (s) => (
              <span className="grid">
                <span className="font-medium">
                  {s.name} {!s.active && <Badge variant="secondary">{t("shifts.inactive")}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{s.email}</span>
              </span>
            ),
          },
          { header: t("shifts.roleLabel"), cell: (s) => s.role_label },
          { header: t("shifts.positions"), cell: (s) => (s.position_ids.length ? s.position_ids.map((p) => posName.get(p)).filter(Boolean).join(", ") : t("shifts.anyPosition")) },
          { header: t("shifts.targetHours"), cell: (s) => (s.target_hours != null ? `${t.number(Number(s.target_hours))} h` : "") },
        ]}
      />
      {(creating || editing) && (
        <UrlSheet params={["new", "edit"]} title={editing?.name ?? t("shifts.newStaff")}>
          <Notice error={param(sp, "error")} />
          <form action={saveStaff} className="grid gap-4">
            {editing ? (
              <input type="hidden" name="id" value={editing.id} />
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="st-user">{t("shifts.member")}</Label>
                <NativeSelect id="st-user" name="user" required defaultValue="" className="w-full">
                  <NativeSelectOption value="" disabled>
                    {t("shifts.pickMember")}
                  </NativeSelectOption>
                  {members
                    ?.filter((m) => !staff?.some((s) => s.user_id === m.user_id))
                    .map((m) => (
                      <NativeSelectOption key={m.user_id} value={m.user_id}>
                        {memberName(m.user_id)}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{t("shifts.memberHint")}</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="st-role">{t("shifts.roleLabel")}</Label>
                <Input id="st-role" name="role_label" defaultValue={editing?.role_label ?? ""} maxLength={100} placeholder={t("shifts.rolePlaceholder")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="st-target">{t("shifts.targetHours")}</Label>
                <Input id="st-target" name="target_hours" inputMode="decimal" defaultValue={editing?.target_hours ?? ""} placeholder="–" />
              </div>
            </div>
            {(positions?.length ?? 0) > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("shifts.canDo")}</legend>
                {positions?.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="positions" value={p.id} defaultChecked={editing?.position_ids.includes(p.id)} className="size-4" />
                    {p.name}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">{t("shifts.canDoHint")}</p>
              </fieldset>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" value="1" defaultChecked={editing?.active ?? true} className="size-4" />
              {t("shifts.activeLabel")}
            </label>
            <SubmitButton className="justify-self-start">{editing ? t("common.save") : t("shifts.newStaff")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
