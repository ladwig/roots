import Link from "next/link"
import { notFound } from "next/navigation"
import { MailIcon, PhoneIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { DataTable, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields, type CustomValues, type FieldDef } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { pageParam, param, withParams, type SearchParams } from "@/lib/url"
import { addNote, createContact, deleteNote, restoreContact, trashContact, updateContact } from "./actions"
import { contactName, COUNTRIES } from "./fields"
import { SubmitButton } from "@/components/submit-button"

type Contact = Tables<"contacts">
type Ctx = Awaited<ReturnType<typeof requirePerm>>
const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const ctx = await requirePerm("crm.view")
  if (!ctx.modules.has("crm")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("crm.manage")
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const tag = param(sp, "tag")
  const trash = canManage && param(sp, "trash") === "1"
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const creating = canManage && param(sp, "new") === "contact"

  // All filtering happens here in the query; the UI only writes the URL.
  let query = ctx.supabase
    .from("contacts")
    .select("id, first_name, last_name, company, email, phone, city, tags, deleted_at")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash
    ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
    : query.is("deleted_at", null).order("last_name", { nullsFirst: false }).order("first_name").order("company")
  if (q) query = query.or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.%${q}%`).join(","))
  if (tag) query = query.contains("tags", [tag])
  const [{ data }, { data: tagRows }, { data: editing }, defs] = await Promise.all([
    query,
    // ponytail: tag chips from the first 2000 contacts; a distinct-tags RPC once orgs have more.
    ctx.supabase.from("contacts").select("tags").eq("org_id", ctx.org.id).is("deleted_at", null).limit(2000),
    editId ? ctx.supabase.from("contacts").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const tags = [...new Set(tagRows?.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, t.locale))
  const chip = (href: string, current: boolean, label: string) => (
    <Link
      key={label}
      href={href}
      aria-current={current ? "true" : undefined}
      className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
    >
      {label}
    </Link>
  )

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold">{t("contacts.title")}</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/contacts/import" />} nativeButton={false} size="sm" variant="outline">
              <UploadIcon /> {t("contacts.import")}
            </Button>
            <Button render={<Link href={withParams(sp, { new: "contact", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
              {t("contacts.new")}
            </Button>
          </div>
        )}
      </div>
      <Notice error={!editId && !creating ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox q={q} label={t("common.search")} />
        <nav aria-label={t("contacts.tags")} className="flex flex-wrap gap-1.5">
          {chip(withParams(sp, { tag: undefined, trash: undefined, page: undefined, edit: undefined }), !trash && !tag, t("contacts.all"))}
          {!trash && tags.map((tg) => chip(withParams(sp, { tag: tg, page: undefined, edit: undefined }), tg === tag, tg))}
          {canManage && chip(withParams(sp, { trash: "1", tag: undefined, page: undefined, edit: undefined }), trash, t("contacts.trash"))}
        </nav>
      </div>
      {trash && <p className="text-sm text-muted-foreground">{t("contacts.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id, new: undefined })}
        empty={trash ? t("contacts.emptyTrash") : q || tag ? t("contacts.noMatch") : t("contacts.empty")}
        columns={[
          {
            header: t("contacts.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{contactName(r)}</span>
                {r.company && contactName(r) !== r.company && <span className="text-xs text-muted-foreground">{r.company}</span>}
              </span>
            ),
          },
          { header: t("contacts.email"), cell: (r) => <span className="break-all">{r.email}</span> },
          { header: t("contacts.phone"), cell: (r) => r.phone, className: "whitespace-nowrap" },
          { header: t("contacts.city"), cell: (r) => r.city },
          {
            header: t("contacts.tags"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.tags.map((tg) => (
                  <Badge key={tg} variant="secondary">
                    {tg}
                  </Badge>
                ))}
              </span>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {creating && (
        <UrlSheet params={["new"]} title={t("contacts.new")}>
          <Notice error={param(sp, "error")} />
          <ContactForm t={t} action={createContact} defs={defs} />
        </UrlSheet>
      )}
      {editing && <EditContact t={t} ctx={ctx} c={editing} sp={sp} canManage={canManage} defs={defs} />}
    </div>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

function ContactForm({ t, action, c, disabled, defs }: { t: T; action: (fd: FormData) => Promise<void>; c?: Contact; disabled?: boolean; defs: FieldDef[] }) {
  const regions = new Intl.DisplayNames([t.locale], { type: "region" })
  return (
    <form action={action} className="grid gap-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset disabled={disabled} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-first" name="first_name" label={t("contacts.firstName")} defaultValue={c?.first_name ?? ""} maxLength={100} autoComplete="off" />
          <Field id="c-last" name="last_name" label={t("contacts.lastName")} defaultValue={c?.last_name ?? ""} maxLength={100} autoComplete="off" />
        </div>
        <Field id="c-company" name="company" label={t("contacts.company")} defaultValue={c?.company ?? ""} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-email" name="email" type="email" label={t("contacts.email")} defaultValue={c?.email ?? ""} maxLength={320} />
          <Field id="c-phone" name="phone" type="tel" label={t("contacts.phone")} defaultValue={c?.phone ?? ""} maxLength={50} />
        </div>
        <Field id="c-street" name="street" label={t("contacts.street")} defaultValue={c?.street ?? ""} maxLength={200} />
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-4">
          <Field id="c-zip" name="postal_code" label={t("contacts.postalCode")} defaultValue={c?.postal_code ?? ""} maxLength={20} />
          <Field id="c-city" name="city" label={t("contacts.city")} defaultValue={c?.city ?? ""} maxLength={100} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="c-country">{t("contacts.country")}</Label>
            <NativeSelect id="c-country" name="country" defaultValue={c?.country ?? ""} className="w-full">
              <NativeSelectOption value="">–</NativeSelectOption>
              {COUNTRIES.map((code) => (
                <NativeSelectOption key={code} value={code}>
                  {regions.of(code)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Field id="c-birthday" name="birthday" type="date" label={t("contacts.birthday")} defaultValue={c?.birthday ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-tags">{t("contacts.tags")}</Label>
          <Input id="c-tags" name="tags" defaultValue={c?.tags.join(", ") ?? ""} aria-describedby="c-tags-help" />
          <p id="c-tags-help" className="text-xs text-muted-foreground">
            {t("contacts.tagsHelp")}
          </p>
        </div>
        <CustomFieldInputs defs={defs} values={c?.custom as CustomValues | undefined} idPrefix="c-custom" />
        {!disabled && (
          <SubmitButton className="justify-self-start">
            {c ? t("common.save") : t("contacts.new")}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  )
}

async function EditContact({ t, ctx, c, sp, canManage, defs }: { t: T; ctx: Ctx; c: Contact; sp: SearchParams; canManage: boolean; defs: FieldDef[] }) {
  const { data: notes } = await ctx.supabase
    .from("contact_notes")
    .select("id, body, created_at, created_by")
    .eq("contact_id", c.id)
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(200)
  const authorIds = [...new Set([c.created_by, ...(notes ?? []).map((n) => n.created_by)].filter((v): v is string => !!v))]
  const { data: people } = authorIds.length
    ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
    : { data: [] }
  const who = (id: string | null) => {
    const p = people?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("contacts.someone")
  }
  const dt = (v: string) => t.date(v, { dateStyle: "medium", timeStyle: "short" })
  // Timeline: notes + created/changed, newest first. Later also tickets, guest lists, emails… of this contact.
  const timeline = [
    ...(notes ?? []).map((n) => ({ key: n.id, at: n.created_at, note: n })),
    ...(c.updated_at !== c.created_at ? [{ key: "updated", at: c.updated_at, note: null }] : []),
    { key: "created", at: c.created_at, note: null },
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <UrlSheet params={["edit"]} title={contactName(c)} description={c.company && contactName(c) !== c.company ? c.company : undefined}>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {c.deleted_at ? (
        <>
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("contacts.deletedOn", {
              date: t.date(c.deleted_at),
              purge: t.date(new Date(new Date(c.deleted_at).getTime() + 30 * 86_400_000)),
            })}
          </p>
          {canManage && (
            <form action={restoreContact}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton>{t("contacts.restore")}</SubmitButton>
            </form>
          )}
        </>
      ) : (
        <>
          {(c.email || c.phone) && (
            <div className="flex flex-wrap gap-2">
              {c.email && (
                <Button render={<a href={`mailto:${c.email}`} />} nativeButton={false} variant="outline" size="sm">
                  <MailIcon /> {t("contacts.email")}
                </Button>
              )}
              {c.phone && (
                <Button render={<a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} />} nativeButton={false} variant="outline" size="sm">
                  <PhoneIcon /> {t("contacts.phone")}
                </Button>
              )}
            </div>
          )}
          {!canManage && <p className="text-sm text-muted-foreground">{t("contacts.readOnly")}</p>}
          <ContactForm t={t} action={updateContact} c={c} disabled={!canManage} defs={defs} />
          <Separator />
          <section className="grid gap-3" aria-labelledby="c-timeline">
            <h3 id="c-timeline" className="font-medium">
              {t("contacts.timeline")}
            </h3>
            {canManage && (
              <form action={addNote} className="grid gap-2">
                <input type="hidden" name="id" value={c.id} />
                <textarea
                  name="body"
                  required
                  maxLength={10000}
                  rows={3}
                  placeholder={t("contacts.notePlaceholder")}
                  aria-label={t("contacts.notePlaceholder")}
                  className={textareaClass}
                />
                <SubmitButton size="sm" variant="outline" className="justify-self-start">
                  {t("contacts.addNote")}
                </SubmitButton>
              </form>
            )}
            <ol className="grid gap-3 border-l pl-4">
              {timeline.map((e) => (
                <li key={e.key} className="relative grid gap-1 text-sm">
                  <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
                  <span className="text-xs text-muted-foreground">
                    {dt(e.at)}
                    {e.note && ` · ${who(e.note.created_by)}`}
                  </span>
                  {e.note ? (
                    <div className="flex items-start gap-2">
                      <p className="flex-1 whitespace-pre-wrap break-words">{e.note.body}</p>
                      {canManage && (
                        <form action={deleteNote}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="note" value={e.note.id} />
                          <Tooltip>
                            <TooltipTrigger
                              render={<SubmitButton variant="ghost" size="icon-sm" aria-label={t("contacts.deleteNote")} />}
                            >
                              <Trash2Icon />
                            </TooltipTrigger>
                            <TooltipContent>{t("contacts.deleteNote")}</TooltipContent>
                          </Tooltip>
                        </form>
                      )}
                    </div>
                  ) : e.key === "created" ? (
                    <p>
                      {t("contacts.createdEntry")} · <span className="text-muted-foreground">{t("contacts.createdBy", { who: who(c.created_by) })}</span>
                    </p>
                  ) : (
                    <p>{t("contacts.updatedEntry")}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
          {canManage && (
            <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
              <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
              <form action={trashContact}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton variant="outline" size="sm">
                  {t("contacts.toTrash")}
                </SubmitButton>
              </form>
            </section>
          )}
        </>
      )}
    </UrlSheet>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
