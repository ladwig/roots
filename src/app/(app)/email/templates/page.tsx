import { SendIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { DataTable } from "@/components/data-table"
import { EmailBodyField } from "@/components/email-body-field"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { builtInTemplate } from "@/email/event-mail"
import { EVENT_PLACEHOLDERS, type Format } from "@/email/render"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import { copyBuiltInTemplate, deleteTemplate, saveTemplateAction, testTemplate } from "../actions"

// Templates for the mails events send on their own (tickets, guest-list tickets, waiting-list offers). One template
// fits all three; the default applies to every event that doesn't pick another one (event page → E-Mails).
export default async function TemplatesPage({ searchParams }: PageProps<"/email/templates">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  const { data } = await ctx.supabase.from("email_templates").select("*").eq("org_id", ctx.org.id).order("name")

  // roots' built-in mail is always the first row: what's sent while there's no own default, and the start for a copy.
  const builtIn = { id: "builtin", name: t("email.templates.builtIn"), ...builtInTemplate(t), is_default: !(data ?? []).some((x) => x.is_default) }
  const rows = [builtIn, ...(data ?? [])]
  const viewingBuiltIn = param(sp, "edit") === "builtin"
  const editing = (data ?? []).find((x) => x.id === param(sp, "edit"))
  const creating = canManage && param(sp, "new") === "1"
  return (
    <>
      <PageHeader area="communication" title={t("email.templates.title")} description={t("email.templates.hint")} primary={canManage ? { href: "/email/templates?new=1", label: t("email.templates.new") } : undefined} />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={rows}
        empty={null}
        rowKey={(x) => x.id}
        rowHref={(x) => `/email/templates?edit=${x.id}`}
        columns={[
          {
            header: t("email.name"),
            cell: (x) => (
              <span className="grid">
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground">{x.subject}</span>
              </span>
            ),
          },
          { header: t("email.status"), cell: (x) => (x.is_default ? <Badge>{t("email.templates.default")}</Badge> : null) },
        ]}
      />
      {viewingBuiltIn && (
        <UrlSheet params={["edit"]} title={builtIn.name} wide>
          <p className="text-sm text-muted-foreground">{t("email.templates.builtInHint")}</p>
          <dl className="grid gap-1 rounded-lg border p-3 text-sm">
            <dt className="text-xs text-muted-foreground">{t("email.subject")}</dt>
            <dd className="font-mono text-xs">{builtIn.subject}</dd>
            <dt className="mt-2 text-xs text-muted-foreground">HTML</dt>
            <dd className="font-mono text-xs break-all">{builtIn.body}</dd>
          </dl>
          <Placeholders t={t} />
          {canManage && (
            <form action={copyBuiltInTemplate}>
              <SubmitButton>{t("email.templates.copy")}</SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
      {(editing || creating) && (
        <UrlSheet
          params={["edit", "new"]}
          title={editing?.name ?? t("email.templates.new")}
          wide
          menu={
            editing && canManage ? (
              <ActionsMenu>
                <MenuSubmit form="tpl-test" icon={<SendIcon />}>
                  {t("email.templates.test")}
                </MenuSubmit>
                <MenuSubmit form="tpl-delete" icon={<Trash2Icon />} destructive confirm="email.templates.confirmDelete">
                  {t("email.delete")}
                </MenuSubmit>
              </ActionsMenu>
            ) : undefined
          }
        >
          <Notice error={param(sp, "error")} />
          <TemplateForm t={t} x={editing} disabled={!canManage} />
          {editing && canManage && (
            <>
              <form id="tpl-test" action={testTemplate} hidden>
                <input type="hidden" name="id" value={editing.id} />
              </form>
              <form id="tpl-delete" action={deleteTemplate} hidden>
                <input type="hidden" name="id" value={editing.id} />
              </form>
            </>
          )}
        </UrlSheet>
      )}
    </>
  )
}

function TemplateForm({ t, x, disabled }: { t: T; x?: Tables<"email_templates">; disabled?: boolean }) {
  const key = x?.id ?? "new"
  const start = x ?? { ...builtInTemplate(t), name: "", is_default: false }
  return (
    <form action={saveTemplateAction} className="grid gap-4">
      {x && <input type="hidden" name="id" value={x.id} />}
      <fieldset disabled={disabled} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`tpl-name-${key}`}>{t("email.name")}</Label>
          <Input id={`tpl-name-${key}`} name="name" required maxLength={200} defaultValue={start.name} placeholder={t("email.templates.namePlaceholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`tpl-subject-${key}`}>{t("email.subject")}</Label>
          <Input id={`tpl-subject-${key}`} name="subject" required maxLength={300} defaultValue={start.subject} />
        </div>
        <EmailBodyField id={`tpl-body-${key}`} format={start.format as Format} body={start.body} placeholders={EVENT_PLACEHOLDERS} disabled={disabled} />
        <p className="text-xs text-muted-foreground">{t("email.templates.placeholderHint")}</p>
        <Placeholders t={t} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_default" defaultChecked={start.is_default} className="size-4 accent-primary" /> {t("email.templates.makeDefault")}
        </label>
      </fieldset>
      {!disabled && <SaveBar label={x ? undefined : t("email.create")} always={!x} />}
    </form>
  )
}

// Every placeholder with what it stands for (the editor's chips only show the names).
function Placeholders({ t }: { t: T }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("email.templates.placeholders")}</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {EVENT_PLACEHOLDERS.map((p) => (
          <div key={p} className="contents">
            <dt className="font-mono text-xs">{`{${p}}`}</dt>
            <dd className="text-muted-foreground">{t.dynamic(`email.eventMail.vars.${p}`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export const instant = false
