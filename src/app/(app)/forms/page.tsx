import { ClipboardListIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { Page, PageHeader } from "@/components/page"
import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { createForm, restoreForm } from "./actions"

export default async function FormsPage({ searchParams }: PageProps<"/forms">) {
  const ctx = await requirePerm("forms.view")
  if (!ctx.modules.has("forms")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("forms.manage")
  const creating = canManage && param(sp, "new") === "1"
  const trash = canManage && param(sp, "trash") === "1"
  const [{ data: forms }, { data: open }] = await Promise.all([
    trash
      ? ctx.supabase.from("forms").select("id, title, purpose, status, slug, updated_at").eq("org_id", ctx.org.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
      : ctx.supabase.from("forms").select("id, title, purpose, status, slug, updated_at").eq("org_id", ctx.org.id).is("deleted_at", null).order("updated_at", { ascending: false }),
    // ponytail: new-submission counts over ≤ 5000 open rows; a grouped RPC if forms get busier.
    ctx.supabase.from("form_submissions").select("form_id").eq("org_id", ctx.org.id).eq("status", "new").limit(5000),
  ])
  const newCount = (id: string) => open?.filter((s) => s.form_id === id).length ?? 0

  return (
    <Page>
      <PageHeader
        area="communication"
        title={trash ? `${t("forms.title")} · ${t("forms.trash")}` : t("forms.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/forms" : "/forms?trash=1"} icon={trash ? <ClipboardListIcon /> : <Trash2Icon />}>
                {trash ? t("forms.all") : t("forms.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: withParams(sp, { new: "1" }), label: t("forms.new") } : undefined}
      />
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {trash && <p className="text-sm text-muted-foreground">{t("forms.trashHint", { days: 30 })}</p>}
      <DataTable
        rows={forms ?? []}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/forms/${r.id}`}
        empty={trash ? t("forms.emptyTrash") : t("forms.empty")}
        columns={[
          { header: t("forms.formTitle"), cell: (r) => <span className="font-medium">{r.title}</span> },
          { header: t("forms.purpose"), cell: (r) => t.dynamic(`forms.purposes.${r.purpose}`) },
          {
            header: t("forms.status"),
            cell: (r) => <Badge variant={r.status === "published" ? "default" : "outline"}>{t.dynamic(`forms.statuses.${r.status}`)}</Badge>,
          },
          {
            header: trash ? "" : t("forms.newSubmissions"),
            cell: (r) =>
              trash ? (
                <form action={restoreForm}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("forms.restore")}
                  </SubmitButton>
                </form>
              ) : newCount(r.id) ? (
                <Badge variant="secondary">{newCount(r.id)}</Badge>
              ) : (
                <span className="text-muted-foreground">–</span>
              ),
          },
        ]}
      />
      {creating && (
        <UrlSheet params={["new"]} title={t("forms.new")}>
          <Notice error={param(sp, "error")} />
          <form action={createForm} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="f-title">{t("forms.formTitle")}</Label>
              <Input id="f-title" name="title" required maxLength={200} placeholder={t("forms.titlePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-purpose">{t("forms.purpose")}</Label>
              <NativeSelect id="f-purpose" name="purpose" defaultValue={ctx.modules.has("members") ? "membership" : "contact"} className="w-full">
                <NativeSelectOption value="contact">{t("forms.purposes.contact")}</NativeSelectOption>
                {ctx.modules.has("members") && <NativeSelectOption value="membership">{t("forms.purposes.membership")}</NativeSelectOption>}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t("forms.purposeHint")}</p>
            </div>
            <SubmitButton className="justify-self-start">{t("forms.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
