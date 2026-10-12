// The website blocks: one Puck config for the editor (client) and the public render (server). Components are plain
// React (no hooks), styled only with the theme variables (var(--s-…), see theme.ts). Live data (events, forms, the
// org, the theme, link base) comes in through Puck's `metadata`, loaded once per page on the server.
import type { Config, Slot } from "@puckeditor/core"
import type { T } from "@/i18n/translate"
import { imageUrl } from "@/lib/images"
import { ImageField } from "./image-field"
import { siteFontVars } from "./fonts"
import { themeVars, type Theme } from "./theme"

export type SiteEvent = { slug: string; title: string; starts_at: string; venue_name: string | null; image_path: string | null }
export type SiteForm = { slug: string; title: string; intro: string | null }
export type SiteEventFull = SiteEvent & { ends_at: string | null; venue_address: string | null; description: string | null; status: string }
export const TEMPLATE_KINDS = ["event", "form", "portal"] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]
export const TEMPLATE_MODULE: Record<TemplateKind, string> = { event: "events", form: "forms", portal: "members" } // template exists with its module
export type SiteMeta = {
  orgId: string
  orgName: string
  logo: string | null
  base: string // "" on the org's subdomain, "/s/<org>" in dev
  editorLinks?: Record<string, string> // editor only: page slug → its editor URL (links switch pages, never leave the editor)
  theme: Theme
  nav: { slug: string; title: string }[]
  events: SiteEvent[]
  forms: SiteForm[]
  modules: string[]
  locale: string
  year: number // footer ©; from the cached site data (no clock reads while rendering)
  labels: { imprint: string; privacy: string; more: string; noEvents: string; poweredBy: string }
  // Templates (event / form / portal page): the record the page is about, and – on the public site only – the real
  // module UI as render functions (server components: ticket shop, timetable, form, portal). The editor shows previews.
  context?: { event?: SiteEventFull; form?: { title: string; intro: string | null } }
  render?: { ticketShop?: () => React.ReactNode; timetable?: () => React.ReactNode; form?: () => React.ReactNode; portal?: () => React.ReactNode }
}

// Site-relative links ("/kontakt") work on the subdomain and under /s/<org> in dev.
// In the editor (preview runs inside the App), own-page links open that page in the editor; anything else does nothing.
const go = (href: string | undefined, meta: SiteMeta): { href: string; target?: string } => {
  if (meta.editorLinks) {
    const slug = href?.startsWith("/") ? href.slice(1).split(/[?#]/)[0] : null
    return slug !== null && meta.editorLinks[slug] ? { href: meta.editorLinks[slug], target: "_top" } : { href: "#" }
  }
  return { href: href?.startsWith("/") ? `${meta.base}${href}` : href || "#" }
}
const wrap = "mx-auto w-full max-w-6xl px-[clamp(16px,4vw,48px)]"
const btn = (style: string | undefined) =>
  style === "outline"
    ? "inline-flex h-11 items-center rounded-[var(--s-radius)] border border-[var(--s-fg)] px-5 text-[15px] font-medium hover:bg-[var(--s-card)]"
    : "inline-flex h-11 items-center rounded-[var(--s-radius)] bg-[var(--s-primary)] px-5 text-[15px] font-medium text-[var(--s-primary-fg)] hover:opacity-90"
const Rich = ({ value }: { value: unknown }) =>
  typeof value === "string" ? (
    <div className="site-rich" dangerouslySetInnerHTML={{ __html: value }} />
  ) : (
    <div className="site-rich">{value as React.ReactNode}</div>
  )
const Img = ({ path, alt, className }: { path?: string; alt?: string; className?: string }) =>
  path ? (
    // eslint-disable-next-line @next/next/no-img-element -- org images from the public bucket, any size
    <img src={imageUrl(path)} alt={alt ?? ""} className={className} loading="lazy" />
  ) : (
    <div className={`${className} grid place-items-center bg-[var(--s-card)] text-sm text-[var(--s-muted)]`} aria-hidden>
      ◻︎
    </div>
  )
const meta = (p: { puck: { metadata: unknown } }) => p.puck.metadata as SiteMeta
// Stand-in for module UI in the editor (the real thing only renders on the public site).
const Placeholder = ({ label }: { label: string }) => (
  <div className={`${wrap} py-4`}>
    <div className="grid min-h-28 place-items-center rounded-[var(--s-radius)] border-2 border-dashed border-[var(--s-line)] text-sm text-[var(--s-muted)]">{label}</div>
  </div>
)

type Btn = { label: string; href: string; style?: string }
type Props = {
  Hero: { title: string; text: string; image: string; layout: string; buttons: Btn[] }
  Heading: { text: string; level: string; align: string }
  Text: { richtext: string; width: string }
  Image: { image: string; alt: string; caption: string; ratio: string }
  Buttons: { buttons: Btn[]; align: string }
  Columns: { columns: string; left: Slot; middle: Slot; right: Slot }
  Cards: { cards: { title: string; text: string; image: string; href: string }[] }
  Stats: { items: { value: string; label: string }[] }
  Faq: { title: string; items: { question: string; answer: string }[] }
  Contact: { title: string; address: string; email: string; phone: string; hours: string; href: string }
  Space: { size: string }
  Events: { title: string; limit: number; layout: string }
  Form: { form: string; button: string }
  Portal: { title: string; text: string; button: string }
  EventHeader: { layout: string }
  EventText: Record<string, never>
  EventTimetable: Record<string, never>
  TicketShop: Record<string, never>
  FormHeader: Record<string, never>
  FormFields: Record<string, never>
  PortalBox: Record<string, never>
}

// The app's shadcn tokens mapped to the site theme, so module pages (event, form, checkout, portal) inside the
// frame pick up the site's colours too.
const APP_TOKENS: Record<string, string> = {
  "--background": "var(--s-bg)",
  "--foreground": "var(--s-fg)",
  "--card": "var(--s-card)",
  "--card-foreground": "var(--s-fg)",
  "--popover": "var(--s-bg)",
  "--popover-foreground": "var(--s-fg)",
  "--primary": "var(--s-primary)",
  "--primary-foreground": "var(--s-primary-fg)",
  "--secondary": "var(--s-card)",
  "--secondary-foreground": "var(--s-fg)",
  "--muted": "var(--s-card)",
  "--muted-foreground": "var(--s-muted)",
  "--accent": "var(--s-card)",
  "--accent-foreground": "var(--s-fg)",
  "--border": "var(--s-line)",
  "--input": "var(--s-line)",
  "--ring": "var(--s-primary)",
  "--radius": "var(--s-radius)",
}

/** Header (logo, name, menu) + footer (legal links) around every public page of a live website, in its theme. */
export function SiteFrame({ meta: m, children }: { meta: SiteMeta; children: React.ReactNode }) {
  return (
    <div
      className={`${siteFontVars} site-page flex min-h-dvh flex-col bg-[var(--s-bg)] font-[family-name:var(--s-font)] text-[var(--s-fg)]`}
      style={{ ...themeVars(m.theme), ...APP_TOKENS } as React.CSSProperties}
    >
      <header className="border-b border-[var(--s-line)]">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-4`}>
          <a {...go("/", m)} className="flex items-center gap-3 font-semibold">
            {m.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- org logo
              <img src={imageUrl(m.logo)} alt="" className="size-9 rounded-[var(--s-radius)] object-contain" />
            )}
            <span className="text-lg">{m.orgName}</span>
          </a>
          {m.nav.length > 1 && (
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
              {m.nav.map((n) => (
                <a key={n.slug} {...go(`/${n.slug}`, m)} className="text-[var(--s-muted)] hover:text-[var(--s-fg)]">
                  {n.title}
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-16 border-t border-[var(--s-line)]">
        <div className={`${wrap} flex flex-wrap justify-between gap-4 py-8 text-sm text-[var(--s-muted)]`}>
          <span>
            © {m.year} {m.orgName}
          </span>
          <span className="flex gap-5">
            <a {...go("/imprint", m)} className="hover:text-[var(--s-fg)]">
              {m.labels.imprint}
            </a>
            <a {...go("/privacy", m)} className="hover:text-[var(--s-fg)]">
              {m.labels.privacy}
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}

export function siteConfig(t: T): Config<{ components: Props; root: { title?: string } }> {
  const L = (k: string) => t.dynamic(`sites.fields.${k}`)
  const opt = (group: string, keys: readonly string[]) => keys.map((k) => ({ value: k, label: t.dynamic(`sites.options.${group}.${k}`) }))
  const image = { type: "custom" as const, label: L("image"), render: ImageField }
  const buttons = {
    type: "array" as const,
    label: L("buttons"),
    max: 3,
    arrayFields: { label: { type: "text" as const, label: L("label") }, href: { type: "text" as const, label: L("href") }, style: { type: "select" as const, label: L("style"), options: opt("style", ["solid", "outline"]) } },
    defaultItemProps: { label: t("sites.defaults.button"), href: "/", style: "solid" },
    getItemSummary: (b: Btn) => b.label || "–",
  }

  return {
    categories: {
      layout: { title: t("sites.categories.layout"), components: ["Columns", "Space"] },
      content: { title: t("sites.categories.content"), components: ["Hero", "Heading", "Text", "Image", "Buttons", "Cards", "Stats", "Faq", "Contact"] },
      modules: { title: t("sites.categories.modules"), components: ["Events", "Form", "Portal"] },
      template: { title: t("sites.categories.template"), components: ["EventHeader", "EventText", "EventTimetable", "TicketShop", "FormHeader", "FormFields", "PortalBox"] },
    },
    root: {
      // Published pages get the frame from the public layout (src/app/s/[site]/layout.tsx); the editor draws it here.
      render: ({ children, puck }) => (puck.isEditing ? <SiteFrame meta={puck.metadata as SiteMeta}>{children}</SiteFrame> : <>{children}</>),
    },
    components: {
      Hero: {
        label: t("sites.blocks.Hero"),
        fields: {
          title: { type: "textarea", label: L("title") },
          text: { type: "textarea", label: L("text") },
          image,
          layout: { type: "radio", label: L("layout"), options: opt("heroLayout", ["side", "background", "plain"]) },
          buttons,
        },
        defaultProps: { title: t("sites.defaults.heroTitle"), text: t("sites.defaults.heroText"), image: "", layout: "side", buttons: [{ label: t("sites.defaults.button"), href: "/", style: "solid" }] },
        render: (p) => {
          const m = meta(p)
          const actions = !!p.buttons?.length && (
            <div className="flex flex-wrap gap-3">
              {p.buttons.map((b, i) => (
                <a key={i} {...go(b.href, m)} className={btn(b.style)}>
                  {b.label}
                </a>
              ))}
            </div>
          )
          if (p.layout === "background")
            return (
              <section className="relative isolate overflow-hidden">
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- org image
                  <img src={imageUrl(p.image)} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
                )}
                <div className="absolute inset-0 -z-10 bg-black/45" />
                <div className={`${wrap} grid min-h-[min(80svh,640px)] content-center gap-6 py-20 text-white`}>
                  <h1 className="max-w-[18ch] text-[clamp(36px,6vw,72px)] leading-[1.05] font-semibold tracking-tight whitespace-pre-line">{p.title}</h1>
                  {p.text && <p className="max-w-[56ch] text-lg whitespace-pre-line opacity-90">{p.text}</p>}
                  {actions}
                </div>
              </section>
            )
          return (
            <section className={`${wrap} grid items-center gap-10 py-[clamp(48px,8vw,112px)] ${p.layout === "side" ? "md:grid-cols-2" : ""}`}>
              <div className="grid content-start gap-6">
                <h1 className="max-w-[18ch] text-[clamp(36px,5.5vw,64px)] leading-[1.05] font-semibold tracking-tight whitespace-pre-line">{p.title}</h1>
                {p.text && <p className="max-w-[56ch] text-lg whitespace-pre-line text-[var(--s-muted)]">{p.text}</p>}
                {actions}
              </div>
              {p.layout === "side" && <Img path={p.image} className="aspect-[4/3] w-full rounded-[var(--s-radius)] object-cover" />}
            </section>
          )
        },
      },
      Heading: {
        label: t("sites.blocks.Heading"),
        fields: { text: { type: "text", label: L("text") }, level: { type: "select", label: L("level"), options: opt("level", ["h2", "h3"]) }, align: { type: "radio", label: L("align"), options: opt("align", ["left", "center"]) } },
        defaultProps: { text: t("sites.defaults.heading"), level: "h2", align: "left" },
        render: ({ text, level, align }) => {
          const H = level === "h3" ? "h3" : "h2"
          return (
            <div className={`${wrap} pt-12 pb-2 ${align === "center" ? "text-center" : ""}`}>
              <H className={H === "h2" ? "text-[clamp(28px,3.5vw,44px)] leading-tight font-semibold tracking-tight" : "text-2xl font-semibold"}>{text}</H>
            </div>
          )
        },
      },
      Text: {
        label: t("sites.blocks.Text"),
        fields: { richtext: { type: "richtext", label: L("text") }, width: { type: "radio", label: L("width"), options: opt("width", ["narrow", "wide"]) } },
        defaultProps: { richtext: `<p>${t("sites.defaults.text")}</p>`, width: "narrow" },
        render: ({ richtext, width }) => (
          <div className={`${wrap} py-4`}>
            <div className={width === "wide" ? "" : "max-w-[68ch]"}>
              <Rich value={richtext} />
            </div>
          </div>
        ),
      },
      Image: {
        label: t("sites.blocks.Image"),
        fields: { image, alt: { type: "text", label: L("alt") }, caption: { type: "text", label: L("caption") }, ratio: { type: "select", label: L("ratio"), options: opt("ratio", ["wide", "landscape", "square", "auto"]) } },
        defaultProps: { image: "", alt: "", caption: "", ratio: "wide" },
        render: ({ image: path, alt, caption, ratio }) => (
          <figure className={`${wrap} grid gap-2 py-6`}>
            <Img
              path={path}
              alt={alt}
              className={`w-full rounded-[var(--s-radius)] object-cover ${{ wide: "aspect-[21/9]", landscape: "aspect-[4/3]", square: "aspect-square max-w-xl", auto: "min-h-40" }[ratio] ?? ""}`}
            />
            {caption && <figcaption className="text-sm text-[var(--s-muted)]">{caption}</figcaption>}
          </figure>
        ),
      },
      Buttons: {
        label: t("sites.blocks.Buttons"),
        fields: { buttons, align: { type: "radio", label: L("align"), options: opt("align", ["left", "center"]) } },
        defaultProps: { buttons: [{ label: t("sites.defaults.button"), href: "/", style: "solid" }], align: "left" },
        render: (p) => (
          <div className={`${wrap} flex flex-wrap gap-3 py-6 ${p.align === "center" ? "justify-center" : ""}`}>
            {p.buttons?.map((b, i) => (
              <a key={i} {...go(b.href, meta(p))} className={btn(b.style)}>
                {b.label}
              </a>
            ))}
          </div>
        ),
      },
      Columns: {
        label: t("sites.blocks.Columns"),
        fields: { columns: { type: "radio", label: L("columns"), options: opt("columns", ["2", "3"]) }, left: { type: "slot" }, middle: { type: "slot" }, right: { type: "slot" } },
        defaultProps: { columns: "2", left: [], middle: [], right: [] },
        render: ({ columns, left: Left, middle: Middle, right: Right }) => (
          <div className={`grid gap-x-8 ${columns === "3" ? "md:grid-cols-3" : "md:grid-cols-2"} [&>div>*]:!px-0 ${wrap}`}>
            <Left />
            <Middle />
            {columns === "3" && <Right />}
          </div>
        ),
      },
      Cards: {
        label: t("sites.blocks.Cards"),
        fields: {
          cards: {
            type: "array",
            label: L("cards"),
            max: 12,
            arrayFields: { title: { type: "text", label: L("title") }, text: { type: "textarea", label: L("text") }, image, href: { type: "text", label: L("href") } },
            defaultItemProps: { title: t("sites.defaults.cardTitle"), text: t("sites.defaults.cardText"), image: "", href: "" },
            getItemSummary: (c) => c.title || "–",
          },
        },
        defaultProps: { cards: [1, 2, 3].map(() => ({ title: t("sites.defaults.cardTitle"), text: t("sites.defaults.cardText"), image: "", href: "" })) },
        render: (p) => (
          <div className={`${wrap} grid gap-5 py-8 sm:grid-cols-2 lg:grid-cols-3`}>
            {p.cards?.map((c, i) => {
              const inner = (
                <>
                  {c.image && <Img path={c.image} className="aspect-[16/10] w-full rounded-[var(--s-radius)] object-cover" />}
                  <h3 className="text-lg font-semibold">{c.title}</h3>
                  {c.text && <p className="text-[15px] whitespace-pre-line text-[var(--s-muted)]">{c.text}</p>}
                </>
              )
              return c.href ? (
                <a key={i} {...go(c.href, meta(p))} className="grid content-start gap-3 rounded-[var(--s-radius)] bg-[var(--s-card)] p-5 hover:opacity-90">
                  {inner}
                </a>
              ) : (
                <div key={i} className="grid content-start gap-3 rounded-[var(--s-radius)] bg-[var(--s-card)] p-5">
                  {inner}
                </div>
              )
            })}
          </div>
        ),
      },
      Stats: {
        label: t("sites.blocks.Stats"),
        fields: {
          items: {
            type: "array",
            label: L("items"),
            max: 6,
            arrayFields: { value: { type: "text", label: L("value") }, label: { type: "text", label: L("label") } },
            defaultItemProps: { value: "120", label: t("sites.defaults.statLabel") },
            getItemSummary: (s) => `${s.value} ${s.label}`,
          },
        },
        defaultProps: { items: [{ value: "120", label: t("sites.defaults.statLabel") }, { value: "1998", label: t("sites.defaults.statSince") }, { value: "12", label: t("sites.defaults.statEvents") }] },
        render: ({ items }) => (
          <div className={`${wrap} grid grid-cols-2 gap-6 border-y border-[var(--s-line)] py-10 ${["md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3", "md:grid-cols-4"][Math.min(4, items?.length || 1) - 1]}`}>
            {items?.map((s, i) => (
              <div key={i} className="grid gap-1">
                <span className="text-[clamp(32px,4vw,48px)] font-semibold tracking-tight">{s.value}</span>
                <span className="text-sm text-[var(--s-muted)]">{s.label}</span>
              </div>
            ))}
          </div>
        ),
      },
      Faq: {
        label: t("sites.blocks.Faq"),
        fields: {
          title: { type: "text", label: L("title") },
          items: {
            type: "array",
            label: L("items"),
            max: 30,
            arrayFields: { question: { type: "text", label: L("question") }, answer: { type: "textarea", label: L("answer") } },
            defaultItemProps: { question: t("sites.defaults.question"), answer: t("sites.defaults.answer") },
            getItemSummary: (q) => q.question || "–",
          },
        },
        defaultProps: { title: t("sites.defaults.faqTitle"), items: [{ question: t("sites.defaults.question"), answer: t("sites.defaults.answer") }] },
        render: ({ title, items }) => (
          <section className={`${wrap} grid max-w-3xl gap-4 py-10`}>
            {title && <h2 className="text-[clamp(26px,3vw,40px)] font-semibold tracking-tight">{title}</h2>}
            <div className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
              {items?.map((q, i) => (
                <details key={i} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q.question}
                    <span className="text-[var(--s-muted)] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-[var(--s-muted)]">{q.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ),
      },
      Contact: {
        label: t("sites.blocks.Contact"),
        fields: {
          title: { type: "text", label: L("title") },
          address: { type: "textarea", label: L("address") },
          email: { type: "text", label: L("email") },
          phone: { type: "text", label: L("phone") },
          hours: { type: "textarea", label: L("hours") },
          href: { type: "text", label: L("mapLink") },
        },
        defaultProps: { title: t("sites.defaults.contactTitle"), address: "", email: "", phone: "", hours: "", href: "" },
        render: (p) => (
          <section className={`${wrap} grid gap-6 py-10 md:grid-cols-[1fr_2fr]`}>
            <h2 className="text-[clamp(26px,3vw,40px)] font-semibold tracking-tight">{p.title}</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {p.address && (
                <div>
                  <dt className="text-sm text-[var(--s-muted)]">{L("address")}</dt>
                  <dd className="whitespace-pre-line">
                    {p.address}
                    {p.href && (
                      <>
                        <br />
                        <a href={p.href} className="underline underline-offset-4" target="_blank" rel="noreferrer">
                          {L("mapLink")}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              )}
              {(p.email || p.phone) && (
                <div>
                  <dt className="text-sm text-[var(--s-muted)]">{L("email")}</dt>
                  <dd className="grid">
                    {p.email && (
                      <a href={`mailto:${p.email}`} className="underline underline-offset-4">
                        {p.email}
                      </a>
                    )}
                    {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a>}
                  </dd>
                </div>
              )}
              {p.hours && (
                <div>
                  <dt className="text-sm text-[var(--s-muted)]">{L("hours")}</dt>
                  <dd className="whitespace-pre-line">{p.hours}</dd>
                </div>
              )}
            </dl>
          </section>
        ),
      },
      Space: {
        label: t("sites.blocks.Space"),
        fields: { size: { type: "radio", label: L("size"), options: opt("size", ["sm", "md", "lg"]) } },
        defaultProps: { size: "md" },
        render: ({ size }) => <div aria-hidden className={{ sm: "h-6", md: "h-14", lg: "h-28" }[size] ?? "h-14"} />,
      },
      Events: {
        label: t("sites.blocks.Events"),
        fields: {
          title: { type: "text", label: L("title") },
          limit: { type: "number", label: L("limit"), min: 1, max: 24 },
          layout: { type: "radio", label: L("layout"), options: opt("eventsLayout", ["list", "cards"]) },
        },
        defaultProps: { title: t("sites.defaults.eventsTitle"), limit: 6, layout: "list" },
        render: (p) => {
          const m = meta(p)
          const events = m.events.slice(0, Math.max(1, Math.min(24, p.limit || 6)))
          const when = (v: string) => new Intl.DateTimeFormat(m.locale, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(v))
          return (
            <section className={`${wrap} grid gap-5 py-10`}>
              {p.title && <h2 className="text-[clamp(26px,3vw,40px)] font-semibold tracking-tight">{p.title}</h2>}
              {!events.length ? (
                <p className="text-[var(--s-muted)]">{m.labels.noEvents}</p>
              ) : p.layout === "cards" ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {events.map((e) => (
                    <a key={e.slug} {...go(`/e/${e.slug}`, m)} className="grid content-start gap-3 rounded-[var(--s-radius)] bg-[var(--s-card)] p-4 hover:opacity-90">
                      <Img path={e.image_path ?? undefined} className="aspect-[16/10] w-full rounded-[var(--s-radius)] object-cover" />
                      <span className="text-sm text-[var(--s-muted)]">{when(e.starts_at)}</span>
                      <span className="text-lg font-semibold">{e.title}</span>
                      {e.venue_name && <span className="text-sm text-[var(--s-muted)]">{e.venue_name}</span>}
                    </a>
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
                  {events.map((e) => (
                    <li key={e.slug}>
                      <a {...go(`/e/${e.slug}`, m)} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4 hover:opacity-80">
                        <span className="text-lg font-medium">{e.title}</span>
                        <span className="text-sm text-[var(--s-muted)]">
                          {when(e.starts_at)}
                          {e.venue_name && ` · ${e.venue_name}`}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        },
      },
      Form: {
        label: t("sites.blocks.Form"),
        // Options come from the editor's metadata (the org's published forms), see resolveFields.
        fields: { form: { type: "select", label: L("form"), options: [] }, button: { type: "text", label: L("label") } },
        resolveFields: (_data, { fields, metadata }) => ({
          ...fields,
          form: { type: "select", label: L("form"), options: [{ value: "", label: "–" }, ...((metadata as SiteMeta).forms ?? []).map((f) => ({ value: f.slug, label: f.title }))] },
        }),
        defaultProps: { form: "", button: t("sites.defaults.formButton") },
        render: (p) => {
          const m = meta(p)
          const f = m.forms.find((x) => x.slug === p.form)
          if (!f) return <div className={`${wrap} py-6 text-sm text-[var(--s-muted)]`}>{p.puck.isEditing ? t("sites.pickForm") : null}</div>
          return (
            <section className={`${wrap} py-8`}>
              <div className="grid gap-4 rounded-[var(--s-radius)] bg-[var(--s-card)] p-[clamp(20px,4vw,40px)] md:grid-cols-[1fr_auto] md:items-center">
                <div className="grid gap-2">
                  <h2 className="text-2xl font-semibold">{f.title}</h2>
                  {f.intro && <p className="max-w-[60ch] whitespace-pre-line text-[var(--s-muted)]">{f.intro}</p>}
                </div>
                <a {...go(`/f/${f.slug}`, m)} className={btn("solid")}>
                  {p.button || m.labels.more}
                </a>
              </div>
            </section>
          )
        },
      },
      Portal: {
        label: t("sites.blocks.Portal"),
        fields: { title: { type: "text", label: L("title") }, text: { type: "textarea", label: L("text") }, button: { type: "text", label: L("label") } },
        defaultProps: { title: t("sites.defaults.portalTitle"), text: t("sites.defaults.portalText"), button: t("sites.defaults.portalButton") },
        render: (p) => (
          <section className={`${wrap} py-8`}>
            <div className="grid gap-4 rounded-[var(--s-radius)] border border-[var(--s-line)] p-[clamp(20px,4vw,40px)] md:grid-cols-[1fr_auto] md:items-center">
              <div className="grid gap-2">
                <h2 className="text-2xl font-semibold">{p.title}</h2>
                {p.text && <p className="max-w-[60ch] whitespace-pre-line text-[var(--s-muted)]">{p.text}</p>}
              </div>
              <a {...go("/portal", meta(p))} className={btn("outline")}>
                {p.button}
              </a>
            </div>
          </section>
        ),
      },
      EventHeader: {
        label: t("sites.blocks.EventHeader"),
        fields: { layout: { type: "radio", label: L("layout"), options: opt("eventLayout", ["top", "side", "plain"]) } },
        defaultProps: { layout: "top" },
        render: (p) => {
          const m = meta(p)
          const e = m.context?.event
          if (!e) return <Placeholder label={t("sites.blocks.EventHeader")} />
          const fmt = (v: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(m.locale, { ...o, timeZone: "Europe/Berlin" }).format(new Date(v))
          const sameDay = e.ends_at && new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() < 86_400_000
          const when = `${fmt(e.starts_at, { dateStyle: "full", timeStyle: "short" })}${e.ends_at ? ` – ${sameDay ? fmt(e.ends_at, { timeStyle: "short" }) : fmt(e.ends_at, { dateStyle: "full", timeStyle: "short" })}` : ""}`
          const text = (
            <div className="grid content-start gap-3">
              {e.status === "cancelled" && <span className="justify-self-start rounded-[var(--s-radius)] bg-destructive px-2 py-0.5 text-sm text-white">{t("site.cancelled")}</span>}
              <h1 className="text-[clamp(32px,5vw,56px)] leading-[1.05] font-semibold tracking-tight">{e.title}</h1>
              <p className="text-lg text-[var(--s-muted)]">{when}</p>
              {(e.venue_name || e.venue_address) && (
                <p>
                  {e.venue_name}
                  {e.venue_address && <span className="block text-sm text-[var(--s-muted)]">{e.venue_address}</span>}
                </p>
              )}
            </div>
          )
          const img = e.image_path && p.layout !== "plain" ? <Img path={e.image_path} className="aspect-video w-full rounded-[var(--s-radius)] object-cover" /> : null
          return (
            <section className={`${wrap} grid gap-8 py-[clamp(32px,6vw,72px)] ${p.layout === "side" && img ? "items-center md:grid-cols-2" : ""}`}>
              {p.layout === "top" && img}
              {text}
              {p.layout === "side" && img}
            </section>
          )
        },
      },
      EventText: {
        label: t("sites.blocks.EventText"),
        render: (p) => {
          const e = meta(p).context?.event
          return e?.description ? (
            <div className={`${wrap} py-4`}>
              <p className="max-w-[68ch] text-[17px] leading-relaxed whitespace-pre-line">{e.description}</p>
            </div>
          ) : p.puck.isEditing ? (
            <Placeholder label={t("sites.blocks.EventText")} />
          ) : (
            <></>
          )
        },
      },
      EventTimetable: {
        label: t("sites.blocks.EventTimetable"),
        render: (p) => <div className={`${wrap} py-6`}>{meta(p).render?.timetable?.() ?? <Placeholder label={t("sites.blocks.EventTimetable")} />}</div>,
      },
      TicketShop: {
        label: t("sites.blocks.TicketShop"),
        render: (p) => <div className={`${wrap} py-6`}>{meta(p).render?.ticketShop?.() ?? <Placeholder label={t("sites.blocks.TicketShop")} />}</div>,
      },
      FormHeader: {
        label: t("sites.blocks.FormHeader"),
        render: (p) => {
          const f = meta(p).context?.form
          if (!f) return <Placeholder label={t("sites.blocks.FormHeader")} />
          return (
            <header className={`${wrap} grid max-w-3xl gap-3 pt-[clamp(32px,6vw,72px)] pb-4`}>
              <h1 className="text-[clamp(30px,4.5vw,48px)] leading-tight font-semibold tracking-tight">{f.title}</h1>
              {f.intro && <p className="text-lg whitespace-pre-line text-[var(--s-muted)]">{f.intro}</p>}
            </header>
          )
        },
      },
      FormFields: {
        label: t("sites.blocks.FormFields"),
        render: (p) => <div className={`${wrap} max-w-3xl py-6`}>{meta(p).render?.form?.() ?? <Placeholder label={t("sites.blocks.FormFields")} />}</div>,
      },
      PortalBox: {
        label: t("sites.blocks.PortalBox"),
        render: (p) => <div className={`${wrap} max-w-3xl py-10`}>{meta(p).render?.portal?.() ?? <Placeholder label={t("sites.blocks.PortalBox")} />}</div>,
      },
    },
  }
}

/** Which blocks an org may use on a page of this kind: module blocks need their module, template blocks their template. */
export function allowedBlocks(modules: string[], kind: string = "page") {
  const content = ["Hero", "Heading", "Text", "Image", "Buttons", "Columns", "Cards", "Stats", "Faq", "Contact", "Space"]
  if (kind === "event") return [...content, "EventHeader", "EventText", "EventTimetable", ...(modules.includes("tickets") ? ["TicketShop"] : [])]
  if (kind === "form") return [...content, "FormHeader", "FormFields"]
  if (kind === "portal") return [...content, "PortalBox"]
  return [
    ...content,
    ...(modules.includes("events") ? ["Events"] : []),
    ...(modules.includes("forms") ? ["Form"] : []),
    ...(modules.includes("members") ? ["Portal"] : []),
  ]
}

/** What a new template starts with (roots' standard layout, then the org changes it). */
export function templateStarter(kind: TemplateKind) {
  const b = (type: string, props: Record<string, unknown> = {}) => ({ type, props: { id: crypto.randomUUID(), ...props } })
  const content =
    kind === "event" ? [b("EventHeader", { layout: "top" }), b("EventText"), b("EventTimetable"), b("TicketShop")] : kind === "form" ? [b("FormHeader"), b("FormFields")] : [b("PortalBox")]
  return { root: { props: {} }, content }
}
