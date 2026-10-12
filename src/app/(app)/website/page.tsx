import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLinkIcon, PencilRulerIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl, withParams } from "@/lib/url"
import { FONTS, PRESET_KEYS, PRESETS, RADII, readTheme } from "@/sites/theme"
import { createPage, createStarterSite, saveDesign, savePageSettings, trashPage, unpublishPage } from "./actions"

// Website (module sites): pages (content in the full-screen editor), design, and where the site lives.
export default async function WebsitePage({ searchParams }: PageProps<"/website">) {
  const ctx = await requirePerm("sites.manage")
  if (!ctx.modules.has("sites")) notFound()
  const t = await getT()
  const sp = await searchParams
  const editId = param(sp, "edit")
  const creating = param(sp, "new") === "page"
  const [{ data: pages }, { data: site }] = await Promise.all([
    ctx.supabase
      .from("site_pages")
      .select("id, title, slug, description, in_nav, position, published_at, updated_at")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .order("position")
      .order("created_at"),
    ctx.supabase.from("sites").select("theme").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  const editing = pages?.find((p) => p.id === editId)
  const theme = readTheme(site?.theme)
  const url = siteUrl(ctx.org.slug, "/")
  const changed = (p: { published_at: string | null; updated_at: string }) => !!p.published_at && new Date(p.updated_at).getTime() - new Date(p.published_at).getTime() > 2000

  return (
    <div className="grid max-w-5xl gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-heading text-2xl font-semibold">{t("sites.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sites.intro", { domain: url.replace(/^https?:\/\//, "").replace(/\/$/, "") })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<a href={url} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
            <ExternalLinkIcon /> {t("sites.viewSite")}
          </Button>
          <Button render={<Link href={withParams(sp, { new: "page", edit: undefined })} scroll={false} />} nativeButton={false} size="sm">
            {t("sites.newPage")}
          </Button>
        </div>
      </div>
      <Notice error={!creating && !editing ? param(sp, "error") : undefined} ok={!editing ? param(sp, "ok") : undefined} />

      <section id="pages" aria-labelledby="pages-h" className="grid gap-3">
        <h2 id="pages-h" className="font-medium">
          {t("sites.pages")}
        </h2>
        {!pages?.length && (
          <form action={createStarterSite} className="grid gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">{t("sites.starterText")}</p>
            <SubmitButton className="justify-self-start">{t("sites.starter.create")}</SubmitButton>
          </form>
        )}
        <DataTable
          rows={pages ?? []}
          rowKey={(p) => p.id}
          rowHref={(p) => withParams(sp, { edit: p.id, new: undefined })}
          empty={t("sites.emptyPages")}
          columns={[
            { header: t("sites.pageTitle"), cell: (p) => <span className="font-medium">{p.title}</span> },
            { header: t("sites.slug"), cell: (p) => <code className="text-xs">/{p.slug}</code> },
            { header: t("sites.inNav"), cell: (p) => (p.in_nav ? "✓" : "–") },
            {
              header: t("sites.status"),
              cell: (p) => (
                <span className="flex flex-wrap gap-1">
                  <Badge variant={p.published_at ? "default" : "outline"}>{p.published_at ? t("sites.published") : t("sites.unpublished")}</Badge>
                  {changed(p) && <Badge variant="secondary">{t("sites.draft")}</Badge>}
                </span>
              ),
            },
            {
              header: "",
              cell: (p) => (
                <Button render={<Link href={`/website/${p.id}/edit`} />} nativeButton={false} size="sm" variant="outline">
                  <PencilRulerIcon /> {t("sites.edit")}
                </Button>
              ),
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {t("sites.legalHint")}{" "}
          <Link href="/invoices/settings" className="underline underline-offset-2">
            {t("sites.legalSettings")}
          </Link>
        </p>
      </section>

      <section id="design" aria-labelledby="design-h" className="grid scroll-mt-20 gap-4">
        <h2 id="design-h" className="font-medium">
          {t("sites.design")}
        </h2>
        <form action={saveDesign} className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("sites.preset")}</legend>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {PRESET_KEYS.map((k) => {
                const p = PRESETS[k]
                return (
                  <label key={k} className="grid cursor-pointer gap-2 rounded-lg border p-2 has-checked:border-primary has-checked:ring-2 has-checked:ring-primary/30">
                    <input type="radio" name="preset" value={k} defaultChecked={theme.preset === k} className="sr-only" />
                    {/* Swatch of the preset's own colours (that's the content here, not app styling). */}
                    <span className="grid h-16 grid-cols-[2fr_1fr] overflow-hidden rounded-md border" style={{ background: p.bg }} aria-hidden>
                      <span className="grid content-center gap-1 px-2">
                        <span className="h-1.5 w-10 rounded-full" style={{ background: p.fg }} />
                        <span className="h-1.5 w-7 rounded-full" style={{ background: p.muted }} />
                        <span className="mt-1 h-3 w-8" style={{ background: p.primary, borderRadius: p.radius === "none" ? 0 : p.radius === "small" ? 3 : 8 }} />
                      </span>
                      <span style={{ background: p.card }} />
                    </span>
                    <span className="text-sm">{t.dynamic(`sites.presets.${k}`)}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="d-primary">{t("sites.primary")}</Label>
              <Input id="d-primary" name="primary" defaultValue={theme.primary ?? ""} placeholder="#1d4ed8" pattern="#[0-9a-fA-F]{6}" aria-describedby="d-primary-help" />
              <p id="d-primary-help" className="text-xs text-muted-foreground">
                {t("sites.primaryHelp")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-font">{t("sites.font")}</Label>
              <NativeSelect id="d-font" name="font" defaultValue={theme.font ?? ""} className="w-full">
                <NativeSelectOption value="">{t("sites.defaultOption")}</NativeSelectOption>
                {FONTS.map((f) => (
                  <NativeSelectOption key={f} value={f}>
                    {t.dynamic(`sites.fonts.${f}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-radius">{t("sites.radius")}</Label>
              <NativeSelect id="d-radius" name="radius" defaultValue={theme.radius ?? ""} className="w-full">
                <NativeSelectOption value="">{t("sites.defaultOption")}</NativeSelectOption>
                {RADII.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {t.dynamic(`sites.radii.${r}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <SubmitButton className="justify-self-start">{t("sites.save")}</SubmitButton>
        </form>
      </section>

      {creating && (
        <UrlSheet params={["new"]} title={t("sites.newPage")}>
          <Notice error={param(sp, "error")} />
          <form action={createPage} className="grid gap-4">
            <PageFields t={t} defaults={{ title: pages?.length ? "" : t("sites.home"), slug: "", description: "", position: pages?.length ?? 0 }} />
            <SubmitButton className="justify-self-start">{t("sites.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
      {editing && (
        <UrlSheet params={["edit"]} title={editing.title} description={`/${editing.slug}`}>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href={`/website/${editing.id}/edit`} />} nativeButton={false} size="sm">
              <PencilRulerIcon /> {t("sites.edit")}
            </Button>
            {editing.published_at && (
              <Button render={<a href={siteUrl(ctx.org.slug, `/${editing.slug}`)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
                <ExternalLinkIcon /> {t("sites.open")}
              </Button>
            )}
          </div>
          <form action={savePageSettings} className="grid gap-4">
            <input type="hidden" name="id" value={editing.id} />
            <PageFields t={t} defaults={{ ...editing, description: editing.description ?? "" }} withNav />
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{t("sites.save")}</SubmitButton>
              {editing.published_at && (
                <SubmitButton formAction={unpublishPage} variant="outline" formNoValidate>
                  {t("sites.unpublish")}
                </SubmitButton>
              )}
              <SubmitButton formAction={trashPage} variant="outline" formNoValidate>
                {t("sites.toTrash")}
              </SubmitButton>
            </div>
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

function PageFields({
  t,
  defaults,
  withNav,
}: {
  t: Awaited<ReturnType<typeof getT>>
  defaults: { title: string; slug: string; description: string; position: number; in_nav?: boolean }
  withNav?: boolean
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="p-title">{t("sites.pageTitle")}</Label>
        <Input id="p-title" name="title" required maxLength={120} defaultValue={defaults.title} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="p-slug">{t("sites.slug")}</Label>
        <Input id="p-slug" name="slug" maxLength={60} defaultValue={defaults.slug} placeholder="ueber-uns" aria-describedby="p-slug-help" />
        <p id="p-slug-help" className="text-xs text-muted-foreground">
          {t("sites.slugHelp")}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="p-desc">{t("sites.description")}</Label>
        <Input id="p-desc" name="description" maxLength={300} defaultValue={defaults.description} />
      </div>
      <input type="hidden" name="position" value={defaults.position} />
      {withNav && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="in_nav" defaultChecked={defaults.in_nav} />
          {t("sites.inNav")}
        </label>
      )}
    </>
  )
}

export const instant = false
