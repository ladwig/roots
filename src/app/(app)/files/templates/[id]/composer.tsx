"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { DownloadIcon, FolderInputIcon, Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { ContactPicker } from "@/components/contact-picker"
import { PaperPreview } from "@/components/paper-preview"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { buildLetterView, type Seller } from "@/documents/model"
import { DocumentPage } from "@/documents/templates"
import { useT } from "@/i18n/client"
import { fieldVars, fillHtml, fillText, type LetterField, type Vars } from "@/letters/model"
import { letterContact, saveLetter, sendLetter } from "../actions"

type Contact = { id: string; label: string; detail: string }
type Filled = { vars: Vars; recipient: string[] }

/** Fill a template: contact + fields + date on the left, the letter as it will print on the right (live). */
export function Composer({
  template,
  fields,
  seller,
  logoUrl,
  orgName,
  initialContact,
  initialFilled,
  canManage,
  canPickContact,
}: {
  template: { id: string; name: string; title: string; body: string; letterhead: boolean }
  fields: LetterField[]
  seller: Seller
  logoUrl: string | null
  orgName: string
  initialContact: Contact | null
  initialFilled: Filled | null
  canManage: boolean
  canPickContact: boolean
}) {
  const t = useT()
  const form = useRef<HTMLFormElement>(null)
  const [filled, setFilled] = useState<Filled | null>(initialFilled)
  const [values, setValues] = useState<Record<string, string>>({})
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, startLoading] = useTransition()
  const [busy, setBusy] = useState<"save" | "send" | null>(null)
  const [, startAction] = useTransition()

  const longDate = (iso: string) => t.date(`${iso}T12:00:00Z`, { dateStyle: "long" })
  const view = useMemo(() => {
    const today = longDate(date)
    const vars: Vars = { ...filled?.vars, org: orgName, today, ...fieldVars(fields, values, longDate) }
    return buildLetterView(
      { title: fillText(template.title, vars) || template.name, body: fillHtml(template.body, vars), recipient: filled?.recipient ?? [], date: today, plain: !template.letterhead },
      seller,
      logoUrl,
      t,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- longDate only depends on t
  }, [filled, values, date, template, fields, seller, logoUrl, orgName, t])

  const pickContact = (c: Contact | null) => {
    if (!c) return setFilled(null)
    startLoading(async () => setFilled(await letterContact(c.id)))
  }
  const run = (kind: "save" | "send") => {
    if (!form.current?.reportValidity()) return
    const fd = new FormData(form.current)
    setBusy(kind)
    startAction(async () => {
      const res = await (kind === "save" ? saveLetter : sendLetter)(fd)
      setBusy(null)
      if (res.error) toast.error(res.error)
      else
        toast.success(res.ok, {
          action: "fileId" in res && res.fileId ? { label: t("files.open"), onClick: () => window.open(`/files/${res.fileId}`, "_blank") } : undefined,
        })
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <form ref={form} action={`/files/templates/${template.id}/pdf`} method="post" className="grid gap-4">
        <input type="hidden" name="template" value={template.id} />
        {canPickContact && (
          <div className="grid gap-1.5">
            <ContactPicker name="contact" label={t("letters.recipient")} placeholder={t("letters.recipientPlaceholder")} initial={initialContact} onChange={pickContact} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {loading && <Loader2Icon className="size-3 animate-spin" />}
              {!filled && t("letters.noRecipient")}
            </p>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="l-date">{t("letters.date")}</Label>
          <Input id="l-date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {fields.map((f) => (
          <div key={f.key} className="grid gap-2">
            <Label htmlFor={`l-${f.key}`}>{f.label}</Label>
            {f.type === "textarea" ? (
              <Textarea id={`l-${f.key}`} name={`f.${f.key}`} rows={6} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <Input
                id={`l-${f.key}`}
                name={`f.${f.key}`}
                type={f.type === "date" ? "date" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <SubmitButton>
            <DownloadIcon /> {t("letters.download")}
          </SubmitButton>
          {canManage && (
            <>
              <Button type="button" variant="outline" disabled={!!busy} onClick={() => run("save")}>
                {busy === "save" ? <Loader2Icon className="animate-spin" /> : <FolderInputIcon />} {t("letters.saveFile")}
              </Button>
              <Button type="button" variant="outline" disabled={!!busy || !filled?.vars.email} onClick={() => run("send")}>
                {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {t("letters.send")}
              </Button>
            </>
          )}
        </div>
        {!template.letterhead || seller.street ? null : (
          <p className="text-xs text-muted-foreground">
            <Link href="/invoices/settings" className="underline underline-offset-2">
              {t("invoices.settings")}
            </Link>
          </p>
        )}
      </form>
      <section aria-label={t("letters.preview")} className="grid gap-2">
        <PaperPreview title={t("letters.preview")}>
          <DocumentPage view={view} template="classic" />
        </PaperPreview>
      </section>
    </div>
  )
}
