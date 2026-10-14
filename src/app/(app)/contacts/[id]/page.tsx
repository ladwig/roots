import Link from "next/link"
import { notFound } from "next/navigation"
import { FileTextIcon, MailIcon, PhoneIcon, Trash2Icon } from "lucide-react"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param } from "@/lib/url"
import { addNote, deleteNote, linkContactUser, restoreContact, trashContact, updateContact } from "../actions"
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

  const [{ data: c }, { data: notes }, { data: tagRows }, defs, { data: membership }, { data: tickets }, { data: docs }, { data: subs }, { data: mails }, { data: changes }] = await Promise.all([
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
    ctx.supabase.rpc("contact_changes", { p_contact: id }),
  ])
  if (!c) notFound()
  // Team access: the linked account, and (for managers) the team members who could be linked.
  const [{ data: team }, { data: linkedElsewhere }] = await Promise.all([
    canManage || c.user_id ? ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id) : Promise.resolve({ data: [] }),
    canManage ? ctx.supabase.from("contacts").select("user_id").eq("org_id", ctx.org.id).not("user_id", "is", null).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ])
  const { data: people } = team?.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", team.map((m) => m.user_id)) : { data: [] }
  const linked = people?.find((p) => p.id === c.user_id)
  const linkable = (people ?? []).filter((p) => !linkedElsewhere?.some((l) => l.user_id === p.id))
  const name = contactName(c)
  const tags = ((tagRows ?? []) as unknown as string[]).sort((a, b) => a.localeCompare(b, t.locale))
  const day = (v: string) => t.date(v, { dateStyle: "medium" })

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/contacts", label: t("contacts.title") }, { label: name }]}
        title={name}
        badge={c.deleted_at && <Badge variant="destructive">{t("contacts.trash")}</Badge>}
        meta={
          (c.company && name !== c.company) || c.tags.length ? (
            <>
              {c.company && name !== c.company && <span>{c.company}</span>}
              {c.tags.map((tg) => (
                <Badge key={tg} variant="secondary">
                  {tg}
                </Badge>
              ))}
            </>
          ) : null
        }
        actions={
          !c.deleted_at && (
            <>
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
            </>
          )
        }
        menu={
          !c.deleted_at &&
          (canManage || ctx.can("org.files.view")) && (
            <ActionsMenu>
              {ctx.can("org.files.view") && (
                <MenuLink href={`/files/templates?contact=${c.id}`} icon={FileTextIcon}>
                  {t("contacts.writeLetter")}
                </MenuLink>
              )}
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-contact" icon={Trash2Icon} destructive>
                    {t("contacts.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
      />
      {canManage && (
        <form id="trash-contact" action={trashContact} hidden>
          <input type="hidden" name="id" value={c.id} />
        </form>
      )}
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
        <RecordLayout
          aside={
            <>
            {(linked || canManage) && (
              <Section id="team" title={t("contacts.team.title")}>
                {linked ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{linked.full_name || linked.email}</span>
                      <span className="truncate text-xs text-muted-foreground">{t("contacts.team.hasAccess")}</span>
                    </span>
                    {canManage && (
                      <form action={linkContactUser}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="user_id" value="" />
                        <SubmitButton size="sm" variant="ghost">
                          {t("contacts.team.unlink")}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                ) : linkable.length ? (
                  <form action={linkContactUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <NativeSelect name="user_id" aria-label={t("contacts.team.pick")} defaultValue="" className="min-w-0 flex-1">
                      <NativeSelectOption value="">{t("contacts.team.pick")}</NativeSelectOption>
                      {linkable.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>
                          {p.full_name ? `${p.full_name} · ${p.email}` : p.email}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <SubmitButton size="sm" variant="outline">
                      {t("contacts.team.link")}
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("contacts.team.none")}</p>
                )}
                <p className="text-xs text-muted-foreground">{t("contacts.team.hint")}</p>
              </Section>
            )}
            {ctx.modules.has("members") && ctx.can("members.view") && (
              <Section id="membership" title={t("membership.nav")}>
                {membership ? (
                  <Link href={`/members/${membership.id}`} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
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
            </>
          }
        >
          {!canManage && <p className="text-sm text-muted-foreground">{t("contacts.readOnly")}</p>}
          <ContactForm t={t} action={updateContact} c={c} disabled={!canManage} defs={defs} tags={tags} />
          <Timeline t={t} ctx={ctx} c={c} notes={notes ?? []} changes={changes ?? []} defs={defs} canManage={canManage} />
        </RecordLayout>
      )}
    </Page>
  )
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <FormCard id={id} title={title} description={description}>
      {children}
    </FormCard>
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

// Contact fields shown in the timeline's change entries (others, like technical columns, are left out).
const FIELD_LABELS: Record<string, string> = {
  first_name: "contacts.firstName",
  last_name: "contacts.lastName",
  company: "contacts.company",
  email: "contacts.email",
  phone: "contacts.phone",
  street: "contacts.street",
  postal_code: "contacts.postalCode",
  city: "contacts.city",
  country: "contacts.country",
  birthday: "contacts.birthday",
  tags: "contacts.tags",
  unsubscribed_at: "contacts.unsubscribed",
}

/** One change-log entry → [{ label, from, to }] for the fields people know (custom fields by their label). */
function fieldChanges(oldRow: unknown, newRow: unknown, defs: { key: string; label: string; type: string }[], t: T) {
  const o = (oldRow ?? {}) as Record<string, unknown>
  const n = (newRow ?? {}) as Record<string, unknown>
  const show = (v: unknown, key?: string): string => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "–"
    if (Array.isArray(v)) return v.join(", ")
    if (typeof v === "boolean") return v ? "✓" : "✗"
    const s = String(v)
    if (key === "unsubscribed_at" || /^\d{4}-\d{2}-\d{2}T/.test(s)) return t.date(s, { dateStyle: "medium" })
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return t.date(`${s}T12:00:00`, { dateStyle: "medium" })
    return s.length > 80 ? `${s.slice(0, 80)}…` : s
  }
  const out: { label: string; from: string; to: string }[] = []
  for (const [key, label] of Object.entries(FIELD_LABELS))
    if (key in n || key in o) {
      const from = show(o[key], key)
      const to = show(n[key], key)
      if (from !== to) out.push({ label: t.dynamic(label), from, to })
    }
  if ("custom" in n || "custom" in o) {
    const oc = (o.custom ?? {}) as Record<string, unknown>
    const nc = (n.custom ?? {}) as Record<string, unknown>
    for (const key of new Set([...Object.keys(oc), ...Object.keys(nc)])) {
      const from = show(oc[key])
      const to = show(nc[key])
      if (from !== to) out.push({ label: defs.find((d) => d.key === key)?.label ?? key, from, to })
    }
  }
  return out
}

// Notes, field changes (from the change log) and creation, newest first.
async function Timeline({
  t,
  ctx,
  c,
  notes,
  changes,
  defs,
  canManage,
}: {
  t: T
  ctx: Ctx
  c: { id: string; created_at: string; updated_at: string; created_by: string | null }
  notes: { id: string; body: string; created_at: string; created_by: string | null }[]
  changes: { at: string; actor_id: string | null; old: unknown; new: unknown }[]
  defs: { key: string; label: string; type: string }[]
  canManage: boolean
}) {
  const authorIds = [...new Set([c.created_by, ...notes.map((n) => n.created_by), ...changes.map((x) => x.actor_id)].filter((v): v is string => !!v))]
  const { data: people } = authorIds.length ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", authorIds) : { data: [] }
  const who = (id: string | null) => {
    const p = people?.find((x) => x.id === id)
    return p?.full_name || p?.email || t("contacts.someone")
  }
  const dt = (v: string) => t.date(v, { dateStyle: "medium", timeStyle: "short" })
  const timeline = [
    ...notes.map((n) => ({ key: n.id, at: n.created_at, note: n })),
    ...changes.flatMap((x, i) => {
      const diff = fieldChanges(x.old, x.new, defs, t)
      return diff.length ? [{ key: `change-${i}`, at: x.at, note: null, diff, actor: x.actor_id }] : []
    }),
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
              {"actor" in e && e.actor && ` · ${who(e.actor)}`}
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
            ) : "diff" in e && e.diff ? (
              <ul className="grid gap-0.5">
                {e.diff.map((d) => (
                  <li key={d.label} className="break-words">
                    <span className="text-muted-foreground">{d.label}:</span> <span className="text-muted-foreground line-through">{d.from}</span> → {d.to}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  )
}

export const instant = false
