import Link from "next/link"
import { notFound } from "next/navigation"
import { CopyIcon, PencilIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { RichTextEditor } from "@/components/rich-text-editor"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { PLACEHOLDERS, readFields } from "@/letters/model"
import { contactVars, letterhead, loadTemplate } from "@/letters/server"
import { copyTemplate, saveTemplate, trashTemplate } from "../actions"
import { Composer } from "./composer"
import { FieldsEditor } from "./fields-editor"

export default async function TemplatePage({ params, searchParams }: PageProps<"/files/templates/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("org.files.view")
  const t = await getT()
  const sp = await searchParams
  const contactId = param(sp, "contact")
  const canPickContact = ctx.can("crm.view")
  const [template, head, filled, { data: contact }] = await Promise.all([
    loadTemplate(ctx, id),
    letterhead(ctx),
    contactId && canPickContact ? contactVars(ctx, t, contactId) : Promise.resolve(null),
    contactId && canPickContact
      ? ctx.supabase.from("contacts").select("id, first_name, last_name, company, email").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!template) notFound()
  const own = template.org_id !== null
  const canManage = ctx.can("org.files.manage")
  const editing = own && canManage && param(sp, "edit") === "1"
  const fields = readFields(template.fields)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{template.name}</h1>
          <Badge variant={own ? "default" : "outline"}>{own ? t("letters.own") : t("letters.default")}</Badge>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {own && (
              <Button render={<Link href={withParams(sp, { edit: "1" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                <PencilIcon /> {t("letters.edit")}
              </Button>
            )}
            <form action={copyTemplate}>
              <input type="hidden" name="id" value={template.id} />
              <SubmitButton size="sm" variant={own ? "outline" : "default"}>
                <CopyIcon /> {t("letters.copy")}
              </SubmitButton>
            </form>
          </div>
        )}
      </div>
      {!own && <p className="text-sm text-muted-foreground">{t("letters.defaultHint")}</p>}
      <Notice error={!editing ? param(sp, "error") : undefined} ok={!editing ? param(sp, "ok") : undefined} />

      <Composer
        template={{ id: template.id, name: template.name, title: template.title, body: template.body, letterhead: template.letterhead }}
        fields={fields}
        seller={head.seller}
        logoUrl={head.logoUrl}
        orgName={head.seller.legal_name ?? ctx.org.name}
        initialContact={contact ? { id: contact.id, label: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || contact.email || "–", detail: contact.email ?? "" } : null}
        initialFilled={filled}
        canManage={canManage}
        canPickContact={canPickContact}
      />

      {editing && (
        <UrlSheet params={["edit"]} title={t("letters.edit")} description={template.name}>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <form action={saveTemplate} className="grid gap-5">
            <input type="hidden" name="id" value={template.id} />
            <div className="grid gap-2">
              <Label htmlFor="t-name">{t("letters.name")}</Label>
              <Input id="t-name" name="name" required maxLength={120} defaultValue={template.name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-title">{t("letters.heading")}</Label>
              <Input id="t-title" name="title" maxLength={200} defaultValue={template.title} aria-describedby="t-title-help" />
              <p id="t-title-help" className="text-xs text-muted-foreground">
                {t("letters.headingHelp")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-body">{t("letters.body")}</Label>
              <RichTextEditor id="t-body" name="body" defaultValue={template.body} placeholders={[...PLACEHOLDERS, ...fields.map((f) => f.key)]} />
              <p className="text-xs text-muted-foreground">{t("letters.bodyHelp")}</p>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("letters.fields")}</legend>
              <p className="text-xs text-muted-foreground">{t("letters.fieldsHelp")}</p>
              <FieldsEditor name="fields" defaultValue={fields} />
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="letterhead" defaultChecked={template.letterhead} className="mt-0.5" />
              <span className="grid gap-0.5">
                {t("letters.letterhead")}
                <span className="text-xs text-muted-foreground">{t("letters.letterheadHelp")}</span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{t("letters.save")}</SubmitButton>
              <SubmitButton formAction={trashTemplate} variant="outline" formNoValidate>
                {t("letters.toTrash")}
              </SubmitButton>
            </div>
          </form>
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
