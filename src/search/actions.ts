"use server"

import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { APP_HOME } from "@/lib/url"
import { visibleNav } from "@/modules/nav"

export type SearchItem = { id: string; title: string; detail?: string; href: string }
export type SearchGroup = { key: string; label: string; items: SearchItem[] }

const PER_GROUP = 5
const SETTINGS = [
  { key: "profile" },
  { key: "general" },
  { key: "team" },
  { key: "roles" },
  { key: "modules" },
  { key: "fields" },
  { key: "locations" },
  { key: "integrations", permission: "org.integrations.manage" },
  { key: "api", permission: "org.integrations.manage" },
]

/**
 * ⌘K search in the active org: pages (navigation + settings) by label, records by name/number. Every source checks
 * module + permission; RLS still applies. All queries run in parallel (one round trip).
 * ponytail: ilike per table, 5 hits each; a full-text index or one search RPC once orgs have many thousand rows.
 */
export async function searchApp(input: string): Promise<SearchGroup[]> {
  const ctx = await getContext()
  const t = await getT()
  const q = String(input ?? "")
    .replace(/[%,()*\\]/g, " ")
    .trim()
    .slice(0, 100)
  if (!q) return []
  const like = `%${q}%`
  const lower = q.toLocaleLowerCase(t.locale)
  const on = (module: string, perm: string) => ctx.modules.has(module) && ctx.can(perm)
  const db = ctx.supabase
  const org = ctx.org.id

  // Pages: everything in the sidebar + settings tabs + a few sub-pages, matched by their label.
  const pages: SearchItem[] = [
    { id: "home", title: t("shell.home"), href: APP_HOME },
    { id: "inbox", title: t("inbox.title"), href: "/notifications" },
    // Every page of the sidebar (sub-pages with their area as detail).
    ...visibleNav((m) => ctx.modules.has(m), ctx.can).flatMap((a) =>
      a.children.map((c) => ({ id: c.href, title: c.label === "nav.overview" ? t.dynamic(a.label) : t.dynamic(c.label), detail: a.children.length > 1 ? t.dynamic(a.label) : undefined, href: c.href })),
    ),
    ...(ctx.can("org.files.view")
      ? [
          { id: "files", title: t("files.title"), href: "/files" },
          { id: "templates", title: t("letters.title"), detail: t("files.title"), href: "/files/templates" },
        ]
      : []),
    ...(on("crm", "crm.manage") ? [{ id: "contacts-import", title: t("contacts.import"), detail: t("contacts.title"), href: "/contacts/import" }] : []),
    ...SETTINGS.filter((s) => !s.permission || ctx.can(s.permission)).map((s) => ({
      id: `settings-${s.key}`,
      title: t.dynamic(`settings.tabs.${s.key}`),
      detail: t("shell.settings"),
      href: `/settings/${s.key}`,
    })),
  ]
  const pageHits = pages.filter((p, i, all) => all.findIndex((x) => x.href === p.href) === i && `${p.title} ${p.detail ?? ""}`.toLocaleLowerCase(t.locale).includes(lower))

  const none = Promise.resolve({ data: [] as never[] })
  const day = (v: string | null) => (v ? t.date(v, { dateStyle: "medium" }) : undefined)
  const [contacts, members, events, docs, forms, campaigns, files, templates, wiki, tasks, objects] = await Promise.all([
    on("crm", "crm.view")
      ? db
          .from("contacts")
          .select("id, first_name, last_name, company, email")
          .eq("org_id", org)
          .is("deleted_at", null)
          .or(["first_name", "last_name", "company", "email", "phone", "city"].map((c) => `${c}.ilike.${like}`).join(","))
          .limit(PER_GROUP)
      : none,
    on("members", "members.view")
      ? db.from("memberships").select("id, member_no, contacts(first_name, last_name, company)").eq("org_id", org).is("deleted_at", null).ilike("member_no", like).limit(PER_GROUP)
      : none,
    on("events", "events.view") ? db.from("events").select("id, title, starts_at").eq("org_id", org).is("deleted_at", null).ilike("title", like).order("starts_at", { ascending: false }).limit(PER_GROUP) : none,
    on("invoices", "invoices.view")
      ? db
          .from("documents")
          .select("id, kind, number, recipient_name, title")
          .eq("org_id", org)
          .or(["number", "recipient_name", "title"].map((c) => `${c}.ilike.${like}`).join(","))
          .order("created_at", { ascending: false })
          .limit(PER_GROUP)
      : none,
    on("forms", "forms.view") ? db.from("forms").select("id, title").eq("org_id", org).is("deleted_at", null).ilike("title", like).limit(PER_GROUP) : none,
    on("email", "email.view") ? db.from("email_campaigns").select("id, name").eq("org_id", org).is("deleted_at", null).ilike("name", like).limit(PER_GROUP) : none,
    ctx.can("org.files.view") ? db.from("files").select("id, name, folder").eq("org_id", org).is("deleted_at", null).ilike("name", like).limit(PER_GROUP) : none,
    ctx.can("org.files.view")
      ? db.from("letter_templates").select("id, name").or(`org_id.is.null,org_id.eq.${org}`).is("deleted_at", null).ilike("name", like).limit(PER_GROUP)
      : none,
    on("wiki", "wiki.view")
      ? db.from("wiki_pages").select("id, title").eq("org_id", org).is("deleted_at", null).or(`title.ilike.${like},body.ilike.${like}`).order("updated_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("projects", "projects.view")
      ? db.from("tasks").select("id, title, due_on").eq("org_id", org).is("deleted_at", null).or(`title.ilike.${like},description.ilike.${like}`).order("updated_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("rentals", "rentals.view")
      ? db.from("rental_objects").select("id, name, kind").eq("org_id", org).is("deleted_at", null).or(`name.ilike.${like},description.ilike.${like}`).order("name").limit(PER_GROUP)
      : none,
  ])

  const person = (c: { first_name: string | null; last_name: string | null; company: string | null } | null) =>
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || "–"
  const groups: SearchGroup[] = [
    { key: "pages", label: t("search.pages"), items: pageHits.slice(0, 8) },
    {
      key: "contacts",
      label: t("contacts.title"),
      items: (contacts.data ?? []).map((c) => ({ id: c.id, title: person(c), detail: c.email ?? c.company ?? undefined, href: `/contacts/${c.id}` })),
    },
    {
      key: "members",
      label: t("membership.nav"),
      items: (members.data ?? []).map((m) => ({ id: m.id, title: person(m.contacts), detail: m.member_no ?? undefined, href: `/members/${m.id}` })),
    },
    { key: "events", label: t("eventsPage.nav"), items: (events.data ?? []).map((e) => ({ id: e.id, title: e.title, detail: day(e.starts_at), href: `/events/${e.id}` })) },
    {
      key: "invoices",
      label: t("invoices.nav"),
      items: (docs.data ?? []).map((d) => ({
        id: d.id,
        title: `${t.dynamic(`invoices.kinds.${d.kind}`)} ${d.number ?? ""}`.trim(),
        detail: d.recipient_name ?? d.title ?? undefined,
        href: `/invoices/${d.id}`,
      })),
    },
    { key: "forms", label: t("forms.nav"), items: (forms.data ?? []).map((f) => ({ id: f.id, title: f.title, href: `/forms/${f.id}` })) },
    { key: "email", label: t("email.nav"), items: (campaigns.data ?? []).map((c) => ({ id: c.id, title: c.name, href: `/email/${c.id}` })) },
    { key: "files", label: t("files.title"), items: (files.data ?? []).map((f) => ({ id: f.id, title: f.name, detail: f.folder ?? undefined, href: `/files?edit=${f.id}` })) },
    { key: "wiki", label: t("wiki.title"), items: (wiki.data ?? []).map((w) => ({ id: w.id, title: w.title, href: `/wiki/${w.id}` })) },
    { key: "tasks", label: t("projects.title"), items: (tasks.data ?? []).map((x) => ({ id: x.id, title: x.title, detail: x.due_on ?? undefined, href: `/projects?task=${x.id}` })) },
    { key: "rentals", label: t("rentals.title"), items: (objects.data ?? []).map((x) => ({ id: x.id, title: x.name, detail: t.has(`rentals.kinds.${x.kind}`) ? t.dynamic(`rentals.kinds.${x.kind}`) : x.kind, href: `/rentals/${x.id}` })) },
    { key: "templates", label: t("letters.title"), items: (templates.data ?? []).map((x) => ({ id: x.id, title: x.name, href: `/files/templates/${x.id}` })) },
  ]
  return groups.filter((g) => g.items.length)
}
