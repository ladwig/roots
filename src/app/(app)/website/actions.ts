"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { allowedBlocks } from "@/sites/blocks"
import { pageSlug, RESERVED_SLUGS, sanitizePage } from "@/sites/sanitize"
import { readTheme } from "@/sites/theme"

const PATH = "/website"
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim()

async function manager() {
  const ctx = await requirePerm("sites.manage")
  const t = await getT()
  if (!ctx.modules.has("sites")) back("/", { error: t("errors.not_allowed") })
  return { ctx, t }
}

// A new page starts with a few blocks so the editor isn't empty (home: hero, text, events, contact).
function starter(t: Awaited<ReturnType<typeof getT>>, home: boolean, modules: Set<string>) {
  const id = () => crypto.randomUUID()
  const content = [
    { type: "Hero", props: { id: id(), title: t("sites.defaults.heroTitle"), text: t("sites.defaults.heroText"), image: "", layout: home ? "side" : "plain", buttons: [] } },
    { type: "Text", props: { id: id(), richtext: `<p>${t("sites.defaults.text")}</p>`, width: "narrow" } },
    ...(home && modules.has("events") ? [{ type: "Events", props: { id: id(), title: t("sites.defaults.eventsTitle"), limit: 6, layout: "list" } }] : []),
    ...(home ? [{ type: "Contact", props: { id: id(), title: t("sites.defaults.contactTitle"), address: "", email: "", phone: "", hours: "", href: "" } }] : []),
  ]
  return { root: { props: {} }, content }
}

function readSettings(fd: FormData, t: Awaited<ReturnType<typeof getT>>) {
  const title = text(fd, "title").slice(0, 120)
  const slug = pageSlug(text(fd, "slug"))
  if (!title) return { error: t("sites.titleRequired") }
  if (RESERVED_SLUGS.includes(slug)) return { error: t("sites.slugReserved") }
  return { row: { title, slug, description: text(fd, "description").slice(0, 300) || null, in_nav: fd.get("in_nav") === "on", position: Math.max(0, Math.min(999, Math.floor(Number(fd.get("position")) || 0))) } }
}
const slugError = (t: Awaited<ReturnType<typeof getT>>, e: { code?: string; message: string }) => (e.code === "23505" ? t("sites.slugTaken") : dbError(t, e))

export async function createPage(fd: FormData) {
  const { ctx, t } = await manager()
  const r = readSettings(fd, t)
  if ("error" in r) back(`${PATH}?new=page`, { error: r.error! })
  const { data, error } = await ctx.supabase
    .from("site_pages")
    .insert({ org_id: ctx.org.id, ...r.row, in_nav: true, draft: starter(t, r.row!.slug === "", ctx.modules) as never })
    .select("id")
    .single()
  if (error) back(`${PATH}?new=page`, { error: slugError(t, error) })
  await ctx.supabase.from("sites").upsert({ org_id: ctx.org.id }, { onConflict: "org_id", ignoreDuplicates: true })
  back(`${PATH}/${data!.id}/edit`, { ok: t("sites.created") })
}

export async function savePageSettings(fd: FormData) {
  const { ctx, t } = await manager()
  const id = text(fd, "id")
  const here = `${PATH}?edit=${id}`
  const r = readSettings(fd, t)
  if ("error" in r) back(here, { error: r.error! })
  const { error } = await ctx.supabase.from("site_pages").update(r.row!).eq("id", id).eq("org_id", ctx.org.id)
  back(here, error ? { error: slugError(t, error) } : { ok: t("sites.saved") })
}

export async function unpublishPage(fd: FormData) {
  const { ctx, t } = await manager()
  const id = text(fd, "id")
  const { error } = await ctx.supabase.from("site_pages").update({ published: null, published_at: null }).eq("id", id).eq("org_id", ctx.org.id)
  back(`${PATH}?edit=${id}`, error ? { error: dbError(t, error) } : { ok: t("sites.unpublishedOk") })
}

export async function trashPage(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.site_pages", p_id: text(fd, "id") })
  back(PATH, error ? { error: dbError(t, error) } : { ok: t("sites.trashed") })
}

export async function saveDesign(fd: FormData) {
  const { ctx, t } = await manager()
  const theme = readTheme({ preset: text(fd, "preset"), primary: text(fd, "primary") || undefined, font: text(fd, "font") || undefined, radius: text(fd, "radius") || undefined })
  const { error } = await ctx.supabase.from("sites").upsert({ org_id: ctx.org.id, theme: theme as never }, { onConflict: "org_id" })
  back(`${PATH}#design`, error ? { error: dbError(t, error) } : { ok: t("sites.designSaved") })
}

/** From the editor: save the draft, or save + publish. The document is checked against the org's blocks. */
export async function savePage(id: string, data: unknown, publish: boolean): Promise<{ ok?: string; error?: string }> {
  const ctx = await requirePerm("sites.manage")
  const t = await getT()
  if (!ctx.modules.has("sites") || !/^[0-9a-f-]{36}$/.test(String(id))) return { error: t("errors.not_allowed") }
  const clean = sanitizePage(data, allowedBlocks([...ctx.modules]), ctx.org.id)
  const { error, count } = await ctx.supabase
    .from("site_pages")
    .update({ draft: clean as never, ...(publish && { published: clean as never, published_at: new Date().toISOString() }) }, { count: "exact" })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
  if (error || !count) return { error: error ? dbError(t, error) : t("errors.not_allowed") }
  return { ok: publish ? t("sites.publishedOk") : t("sites.draftSaved") }
}

/** One click: a starter website from the org's modules (home, events, join) as drafts; fails if pages exist. */
export async function createStarterSite() {
  const { ctx, t } = await manager()
  const { count } = await ctx.supabase.from("site_pages").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null)
  if (count) back(PATH, { error: t("sites.starterExists") })
  const has = (m: string) => ctx.modules.has(m)
  const { data: forms } = has("forms")
    ? await ctx.supabase.from("forms").select("slug, title, purpose").eq("org_id", ctx.org.id).eq("status", "published").is("deleted_at", null).order("title").limit(6)
    : { data: [] }
  const id = () => crypto.randomUUID()
  const block = (type: string, props: Record<string, unknown>) => ({ type, props: { id: id(), ...props } })
  const join = forms?.find((f) => f.purpose === "membership") ?? forms?.[0]
  const pages = [
    {
      slug: "",
      title: t("sites.home"),
      content: [
        block("Hero", { title: ctx.org.name, text: t("sites.defaults.heroText"), image: "", layout: "side", buttons: has("events") ? [{ label: t("sites.starter.toEvents"), href: "/termine", style: "solid" }] : [] }),
        block("Text", { richtext: `<p>${t("sites.defaults.text")}</p>`, width: "narrow" }),
        ...(has("events") ? [block("Events", { title: t("sites.defaults.eventsTitle"), limit: 3, layout: "cards" })] : []),
        ...(join ? [block("Form", { form: join.slug, button: t("sites.defaults.formButton") })] : []),
        block("Contact", { title: t("sites.defaults.contactTitle"), address: "", email: "", phone: "", hours: "", href: "" }),
      ],
    },
    ...(has("events")
      ? [{ slug: "termine", title: t("sites.starter.events"), content: [block("Heading", { text: t("sites.starter.events"), level: "h2", align: "left" }), block("Events", { title: "", limit: 24, layout: "list" })] }]
      : []),
    ...((forms?.length ?? 0) || has("members")
      ? [
          {
            slug: "mitmachen",
            title: t("sites.starter.join"),
            content: [
              block("Heading", { text: t("sites.starter.join"), level: "h2", align: "left" }),
              block("Text", { richtext: `<p>${t("sites.starter.joinText")}</p>`, width: "narrow" }),
              ...(forms ?? []).map((f) => block("Form", { form: f.slug, button: t("sites.defaults.formButton") })),
              ...(has("members") ? [block("Portal", { title: t("sites.defaults.portalTitle"), text: t("sites.defaults.portalText"), button: t("sites.defaults.portalButton") })] : []),
            ],
          },
        ]
      : []),
  ]
  const { error } = await ctx.supabase.from("site_pages").insert(
    pages.map((p, i) => ({ org_id: ctx.org.id, slug: p.slug, title: p.title, position: i, in_nav: true, draft: { root: { props: {} }, content: p.content } as never })),
  )
  if (error) back(PATH, { error: dbError(t, error) })
  await ctx.supabase.from("sites").upsert({ org_id: ctx.org.id }, { onConflict: "org_id", ignoreDuplicates: true })
  back(PATH, { ok: t("sites.starterCreated") })
}
