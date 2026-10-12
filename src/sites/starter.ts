// The starter website every org gets when it first opens the editor: home, dates, join us – from its modules,
// all as drafts. Server only (called from the editor entry route).
import type { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"

export async function createStarterSite(ctx: Awaited<ReturnType<typeof getContext>>, t: Awaited<ReturnType<typeof getT>>) {
  const has = (m: string) => ctx.modules.has(m)
  const { data: forms } = has("forms")
    ? await ctx.supabase.from("forms").select("slug, title, purpose").eq("org_id", ctx.org.id).eq("status", "published").is("deleted_at", null).order("title").limit(6)
    : { data: [] }
  const block = (type: string, props: Record<string, unknown>) => ({ type, props: { id: crypto.randomUUID(), ...props } })
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
  const { error } = await ctx.supabase
    .from("site_pages")
    .insert(pages.map((p, i) => ({ org_id: ctx.org.id, slug: p.slug, title: p.title, position: i, in_nav: true, draft: { root: { props: {} }, content: p.content } as never })))
  if (error) throw error
  await ctx.supabase.from("sites").upsert({ org_id: ctx.org.id }, { onConflict: "org_id", ignoreDuplicates: true })
}
