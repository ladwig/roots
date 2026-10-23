import { Notice } from "@/components/notice"
import { FormCard, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { imprintDraft, loadSite } from "@/site/server"
import { saveWebsiteDraft } from "../../actions"
import { PublishBar } from "../../publish-bar"

// Website › Seiten › Impressum & Datenschutz (Markdown, linked at the bottom of every public page).
export default async function LegalPage({ searchParams }: PageProps<"/website/pages/legal">) {
  const ctx = await requirePerm("org.site.manage")
  const t = await getT()
  const sp = await searchParams
  const [site, { data: billing }] = await Promise.all([
    loadSite(ctx.supabase, ctx.org.id),
    ctx.supabase.from("org_billing").select("legal_name, street, postal_code, city, email, phone, representatives, register, vat_id").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  return (
    <>
      <PageHeader crumbs={[{ label: t("website.pages.nav"), href: "/website/pages" }, { label: t("website.pages.legal") }]} title={t("website.pages.legal")} description={t("site.legalHint")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <PublishBar t={t} pending={site.pending} url={siteUrl(ctx.org.slug, "", ctx.org.site_domain)} back="/website/pages/legal" />
      <form action={saveWebsiteDraft} className="grid max-w-3xl gap-6">
        <input type="hidden" name="back" value="/website/pages/legal" />
        <FormCard title={t("site.imprint")}>
          <Label htmlFor="imprint" className="sr-only">{t("site.imprint")}</Label>
          <Textarea id="imprint" name="imprint" rows={10} maxLength={20000} defaultValue={site.draft.imprint ?? imprintDraft(billing, ctx.org.name)} />
        </FormCard>
        <FormCard title={t("site.privacy")}>
          <Label htmlFor="privacy" className="sr-only">{t("site.privacy")}</Label>
          <Textarea id="privacy" name="privacy" rows={12} maxLength={60000} defaultValue={site.draft.privacy ?? ""} placeholder={t("site.privacyPlaceholder")} />
        </FormCard>
        <SaveBar label={t("website.saveDraft")} />
      </form>
    </>
  )
}

export const instant = false
