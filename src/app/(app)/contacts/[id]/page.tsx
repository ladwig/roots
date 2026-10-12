import Link from "next/link"
import { notFound } from "next/navigation"
import { FileTextIcon, MailIcon, PhoneIcon, Trash2Icon } from "lucide-react"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { addNote, deleteNote, restoreContact, trashContact, updateContact } from "../actions"
import { ContactForm } from "../contact-form"
import { contactName } from "../fields"

type Ctx = Awaited<ReturnType<typeof requirePerm>>
const LIMIT = 10

// One person, everything about them: details, membership, what they bought/sent/received, files, notes.
export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("crm.view")
  if (!ctx.modules.has("crm") || !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("crm.manage")
  const on = (module: string, perm: string) => ctx.modules.has(module) && ctx.can(perm)
  const none = Promise.resolve({ data: null })
  const by = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => q.eq("org_id", ctx.org.id).eq("contact_id", id)

  const [{ data: c }, { data: notes }, { data: tagRows }, defs, { data: membership }, { data: tickets }, { data: docs }, { data: subs }, { data: mails }] = await Promise.all([
    ctx.supabase.from("contacts").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    by(ctx.supabase.from("contact_notes").select("id, body, created_at, created_by")).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
    on("members", "members.view")
      ? by(ctx.supabase.from("memberships").select("id, member_no, starts_on, ends_on, membership_types(name)")).is("deleted_at", null).order("starts_on", { ascending: false }).limit(1).maybeSingle()
      : none,
    on("tickets", "tickets.view")
      ? by(ctx.supabase.from("tickets").select("id, status, created_at, event_id, events(title), ticket_types(name)")).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
    on("invoices", "invoices.view")
      ? by(ctx.supabase.from("documents").select("id, kind, status, number, issue_date, gross_total, currency, created_at")).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
    on("forms", "forms.view")
      ? by(ctx.supabase.from("form_submissions").select("id, status, created_at, form_id, forms(title)")).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
    on("email", "email.view")
      ? by(ctx.supabase.from("email_sends").select("id, status, delivery, sent_at, send_after, email_campaigns(name), email_automations(name)")).order("created_at", { ascending: false }).limit(LIMIT)
      : none,
  ])
  if (!c) notFound()
  const name = contactName(c)
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
  const day = (v: string) => t.date(v, { dateStyle: "medium" })

  return (
    <div className="grid max-w-6xl gap-6">
      <PageCrumbs items={[{ href: "/contacts", label: t("contacts.title") }, { label: name }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="font-heading text-2xl font-semibold break-words">{name}</h1>
          {(c.company && name !== c.company) || c.tags.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {c.company && name !== c.company && <span>{c.company}</span>}
              {c.tags.map((tg) => (
                <Badge key={tg} variant="secondary">
                  {tg}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {!c.deleted_at && (
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
            {ctx.can("org.files.view") && (
              <Button render={<Link href={`/files/templates?contact=${c.id}`} />} nativeButton={false} variant="outline" size="sm">
                <FileTextIcon /> {t("contacts.writeLetter")}
              </Button>
            )}
          </div>
        )}
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {c.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
            {t("contacts.deletedOn", { date: t.date(c.deleted_at), purge: t.date(new Date(new Date(c.deleted_at).getTime() + 30 * 86_400_000)) })}
          </p>
          {canManage && (
            <form action={restoreContact}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton>{t("contacts.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="grid min-w-0 gap-6">
            <Section id="details" title={t("contacts.details")}>
              {!canManage && <p className="text-sm text-muted-foreground">{t("contacts.readOnly")}</p>}
              <ContactForm t={t} action={updateContact} c={c} disabled={!canManage} defs={defs} tags={tags} />
            </Section>
            <Timeline t={t} ctx={ctx} c={c} notes={notes ?? []} canManage={canManage} />
          </div>

          <aside className="grid min-w-0 gap-6">
            {ctx.modules.has("members") && ctx.can("members.view") && (
              <Section id="membership" title={t("membership.nav")}>
                {membership ? (
                  <Link href={`/members?edit=${membership.id}`} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                    <span className="font-medium">
                      {membership.membership_types?.name ?? "–"}
                      {membership.member_no && <span className="text-muted-foreground"> · {membership.member_no}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("contacts.memberSince", { date: day(membership.starts_on) })}
                      {membership.ends_on && ` · ${t("membership.state.ending", { date: day(membership.ends_on) })}`}
                    </span>
                  </Link>
                ) : ctx.can("members.manage") ? (
                  <Button render={<Link href={`/members?new=1&contact=${c.id}`} />} nativeButton={false} size="sm" variant="outline" className="justify-self-start">
                    {t("membership.makeMember")}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("contacts.noMembership")}</p>
                )}
              </Section>
            )}
            {!!tickets?.length && (
              <Section id="tickets" title={t("tickets.title")}>
                <Rows
                  rows={tickets.map((x) => ({
                    key: x.id,
                    href: `/events/${x.event_id}/tickets`,
                    title: x.events?.title ?? "–",
                    detail: [x.ticket_types?.name, day(x.created_at)].filter(Boolean).join(" · "),
                    badge: t.dynamic(`tickets.statuses.${x.status}`),
                  }))}
                />
              </Section>
            )}
            {!!docs?.length && (
              <Section id="invoices" title={t("contacts.invoices")}>
                <Rows
                  rows={docs.map((d) => ({
                    key: d.id,
                    href: `/invoices/${d.id}`,
                    title: `${t.dynamic(`invoices.kinds.${d.kind}`)} ${d.number ?? ""}`.trim(),
                    detail: [t.money(d.gross_total, d.currency), d.issue_date ? day(d.issue_date) : day(d.created_at)].join(" · "),
                    badge: t.dynamic(`invoices.statuses.${d.kind}.${d.status}`),
                  }))}
                />
              </Section>
            )}
            {!!subs?.length && (
              <Section id="forms" title={t("contacts.submissions")}>
                <Rows
                  rows={subs.map((s) => ({
                    key: s.id,
                    href: `/forms/${s.form_id}/submissions?sub=${s.id}`,
                    title: s.forms?.title ?? "–",
                    detail: day(s.created_at),
                    badge: t.dynamic(`forms.subStatus.${s.status}`),
                  }))}
                />
              </Section>
            )}
            {!!mails?.length && (
              <Section id="emails" title={t("contacts.emails")}>
                <Rows
                  rows={mails.map((m) => ({
                    key: m.id,
                    href: "/email/log",
                    title: m.email_campaigns?.name ?? m.email_automations?.name ?? "–",
                    detail: day(m.sent_at ?? m.send_after),
                    badge: m.delivery ? t.dynamic(`email.delivery.${m.delivery}`) : t.dynamic(`email.sendStatus.${m.status}`),
                  }))}
                />
              </Section>
            )}
            <FileList ctx={ctx} entity="contacts" entityId={c.id} back={`/contacts/${c.id}`} />
            {canManage && (
              <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
                <h2 className="font-medium text-destructive">{t("admin.dangerZone")}</h2>
                <form action={trashContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="outline" size="sm">
                    {t("contacts.toTrash")}
                  </SubmitButton>
                </form>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-20 content-start gap-3">
      <h2 id={`${id}-h`} className="font-medium">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: { key: string; href: string; title: string; detail: string; badge: string }[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{r.title}</span>
              <span className="truncate text-xs text-muted-foreground">{r.detail}</span>
            </span>
            <Badge variant="outline" className="shrink-0">
              {r.badge}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Notes + created/changed, newest first.
async function Timeline({
  t,
  ctx,
  c,
  notes,
  canManage,
}: {
  t: T
  ctx: Ctx
  c: { id: string; created_at: string; updated_at: string; created_by: string | null }
  notes: { id: string; body: string; created_at: string; created_by: string | null }[]
  canManage: boolean
}) {
  const authorIds = [...new Set([c.created_by, ...notes.map((n) => n.created_by)].filter((v): v is string => !!v))]
  const { data: people } = authorIds.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", authorIds) : { data: [] }
  const who = (id: string | null) => {
    const p = people?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("contacts.someone")
  }
  const dt = (v: string) => t.date(v, { dateStyle: "medium", timeStyle: "short" })
  const timeline = [
    ...notes.map((n) => ({ key: n.id, at: n.created_at, note: n })),
    ...(c.updated_at !== c.created_at ? [{ key: "updated", at: c.updated_at, note: null }] : []),
    { key: "created", at: c.created_at, note: null },
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Section id="activity" title={t("contacts.timeline")}>
      {canManage && (
        <form action={addNote} className="grid gap-2">
          <input type="hidden" name="id" value={c.id} />
          <Textarea name="body" required maxLength={10000} rows={3} placeholder={t("contacts.notePlaceholder")} aria-label={t("contacts.notePlaceholder")} />
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
                <p className="flex-1 break-words whitespace-pre-wrap">{e.note.body}</p>
                {canManage && (
                  <form action={deleteNote}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="note" value={e.note.id} />
                    <Tooltip>
                      <TooltipTrigger render={<SubmitButton variant="ghost" size="icon-sm" aria-label={t("contacts.deleteNote")} />}>
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
    </Section>
  )
}

export const instant = false
