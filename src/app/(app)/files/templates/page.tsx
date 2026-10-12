import Link from "next/link"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { createTemplate, restoreTemplate } from "./actions"

// Letter templates: roots' defaults (org_id null) + the org's own. Click → fill in (/files/templates/<id>).
export default async function TemplatesPage({ searchParams }: PageProps<"/files/templates">) {
  const ctx = await requirePerm("org.files.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("org.files.manage")
  const creating = canManage && param(sp, "new") === "template"
  const trash = canManage && param(sp, "trash") === "1"
  // From a contact's "Brief erstellen": keep the contact for the template that gets picked.
  const contact = param(sp, "contact")
  const forContact = contact && /^[0-9a-f-]{36}$/.test(contact) ? `?contact=${contact}` : ""
  const cols = "id, org_id, name, updated_at"
  const { data } = trash
    ? await ctx.supabase.from("letter_templates").select(cols).eq("org_id", ctx.org.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false })
    : await ctx.supabase.from("letter_templates").select(cols).or(`org_id.is.null,org_id.eq.${ctx.org.id}`).is("deleted_at", null).order("name")
  // Own templates first, then the defaults.
  const rows = [...(data ?? [])].sort((a, b) => Number(a.org_id === null) - Number(b.org_id === null))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-heading text-2xl font-semibold">{t("letters.title")}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{t("letters.intro")}</p>
        </div>
        {canManage && (
          <Button render={<Link href={withParams(sp, { new: "template" })} scroll={false} />} nativeButton={false} size="sm">
            {t("letters.new")}
          </Button>
        )}
      </div>
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {canManage && (
        <nav aria-label={t("letters.kind")} className="flex flex-wrap gap-1.5">
          {[
            { href: "/files/templates", current: !trash, label: t("letters.all") },
            { href: "/files/templates?trash=1", current: trash, label: t("letters.trash") },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              aria-current={c.current ? "true" : undefined}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}
      {trash && <p className="text-sm text-muted-foreground">{t("letters.trashHint", { days: 30 })}</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={trash ? undefined : (r) => `/files/templates/${r.id}${forContact}`}
        empty={trash ? t("letters.emptyTrash") : t("letters.empty")}
        columns={[
          { header: t("letters.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: t("letters.kind"), cell: (r) => <Badge variant={r.org_id ? "default" : "outline"}>{r.org_id ? t("letters.own") : t("letters.default")}</Badge> },
          {
            header: trash ? "" : t("letters.updated"),
            className: "whitespace-nowrap",
            cell: (r) =>
              trash ? (
                <form action={restoreTemplate}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("letters.restore")}
                  </SubmitButton>
                </form>
              ) : r.org_id ? (
                t.date(r.updated_at)
              ) : (
                ""
              ),
          },
        ]}
      />

      {creating && (
        <UrlSheet params={["new"]} title={t("letters.new")}>
          <Notice error={param(sp, "error")} />
          <form action={createTemplate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="t-name">{t("letters.name")}</Label>
              <Input id="t-name" name="name" required maxLength={120} autoFocus />
            </div>
            <SubmitButton className="justify-self-start">{t("letters.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
