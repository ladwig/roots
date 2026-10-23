import { Choice } from "@/components/choice"
import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { AutoSave } from "@/app/(app)/website/autosave"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { loadSite } from "@/site/server"
import { FONTS, RADII } from "@/site/theme"
import { saveWebsiteDraft } from "../actions"
import { ColorField } from "../color-field"
import { Preview, PublishBar } from "../publish-bar"

// Website › Marke: the look of all public pages (start page, events, shop, checkout, forms, portal).
export default async function BrandPage({ searchParams }: PageProps<"/website/brand">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const site = await loadSite(ctx.supabase, ctx.org.id)
  const th = site.draft.theme
  const fontSelect = (name: string, value?: string) => (
    <NativeSelect id={name} name={name} defaultValue={value ?? ""} className="w-full">
      <NativeSelectOption value="">{t("website.brand.defaultFont")}</NativeSelectOption>
      {FONTS.map((f) => (
        <NativeSelectOption key={f.key} value={f.key}>
          {f.family}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
  return (
    <>
      <PageHeader area="website" title={t("website.brand.nav")} description={t("website.brand.intro")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/brand" />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveWebsiteDraft} className="grid content-start gap-6">
          <input type="hidden" name="back" value="/website/brand" />
          <FormCard title={t("website.brand.colors")} description={t("website.brand.colorsHint")}>
            <div className="grid gap-2">
              <Label htmlFor="theme.mode">{t("website.brand.mode")}</Label>
              <Choice id="theme.mode" name="theme.mode" required label={t("website.brand.mode")} defaultValue={th.mode ?? "light"} options={[{ value: "light", label: t("website.brand.light") }, { value: "dark", label: t("website.brand.dark") }]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField name="theme.background" label={t("website.brand.background")} defaultValue={th.background} />
              <ColorField name="theme.text" label={t("website.brand.text")} defaultValue={th.text} />
              <ColorField name="theme.accent" label={t("website.brand.accent")} defaultValue={th.accent} />
            </div>
          </FormCard>
          <FormCard title={t("website.brand.type")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="theme.font_heading">{t("website.brand.fontHeading")}</Label>
                {fontSelect("theme.font_heading", th.font_heading)}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="theme.font_body">{t("website.brand.fontBody")}</Label>
                {fontSelect("theme.font_body", th.font_body)}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="theme.radius">{t("website.brand.radius")}</Label>
              <Choice id="theme.radius" name="theme.radius" label={t("website.brand.radius")} defaultValue={th.radius} options={(Object.keys(RADII) as (keyof typeof RADII)[]).map((r) => ({ value: r, label: t(`website.brand.radii.${r}`) }))} />
            </div>
          </FormCard>
          <details className="rounded-xl border p-4" open={!!site.draft.css}>
            <summary className="cursor-pointer font-medium">{t("website.brand.css")}</summary>
            <div className="mt-3 grid gap-2">
              <p className="text-sm text-muted-foreground">{t("website.brand.cssHint")}</p>
              <Textarea name="css" defaultValue={site.draft.css ?? ""} rows={10} maxLength={50000} spellCheck={false} className="font-mono text-xs" aria-label={t("website.brand.css")} placeholder={".site-header { padding: 1rem }\nh1 { letter-spacing: -0.02em }"} />
            </div>
          </details>
          <AutoSave />
        </form>
        <Preview t={t} version={site.version} />
      </div>
    </>
  )
}

export const instant = false
