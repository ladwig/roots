import { ExternalLinkIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl } from "@/lib/url"
import { BLOCK_TYPES, blockAvailable, DEFAULT_BLOCKS, readBlocks } from "@/site/blocks"
import { imprintDraft } from "@/site/server"
import { saveWebsite } from "./actions"
import { SiteEditor } from "./editor"

// The org's public start page: tagline, blocks (own texts + what the active modules offer), Impressum, Datenschutz.
export default async function WebsiteSettings({ searchParams }: PageProps<"/settings/website">) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const sp = await searchParams
  const has = (m: string) => ctx.modules.has(m)
  const now = new Date().toISOString()
  const [{ data: site }, { data: events }, { data: forms }, { data: billing }] = await Promise.all([
    ctx.supabase.from("org_sites").select("tagline, blocks, imprint, privacy").eq("org_id", ctx.org.id).maybeSingle(),
    has("events")
      ? ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).neq("status", "draft").gte("starts_at", now).order("starts_at").limit(50)
      : Promise.resolve({ data: null }),
    has("forms") ? ctx.supabase.from("forms").select("slug, title").eq("org_id", ctx.org.id).eq("status", "published").is("deleted_at", null).order("title") : Promise.resolve({ data: null }),
    ctx.supabase.from("org_billing").select("legal_name, street, postal_code, city, email, phone, representatives, register, vat_id").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  const url = siteUrl(ctx.org.slug, "", ctx.org.site_domain)
  return (
    <form action={saveWebsite} className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">{t("site.intro")}</p>
        <Button variant="outline" size="sm" render={<a href={url} target="_blank" rel="noreferrer" />} nativeButton={false}>
          <ExternalLinkIcon /> {t("site.open")}
        </Button>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <FormCard id="head" title={t("site.headTitle")} description={t("site.headHint")}>
        <div className="grid gap-2">
          <Label htmlFor="tagline">{t("site.tagline")}</Label>
          <Input id="tagline" name="tagline" defaultValue={site?.tagline ?? ""} maxLength={300} placeholder={t("site.taglinePlaceholder")} />
        </div>
      </FormCard>

      <FormCard id="blocks" title={t("site.blocksTitle")} description={t("site.blocksHint")}>
        <SiteEditor
          initial={site ? readBlocks(site.blocks) : DEFAULT_BLOCKS}
          types={BLOCK_TYPES.filter((b) => blockAvailable(b.type, ctx.modules)).map((b) => b.type)}
          events={(events ?? []).map((e) => ({ value: e.id, label: `${e.title} · ${t.date(e.starts_at, { dateStyle: "medium" })}` }))}
          forms={(forms ?? []).map((f) => ({ value: f.slug, label: f.title }))}
        />
      </FormCard>

      <FormCard id="legal" title={t("site.legalTitle")} description={t("site.legalHint")}>
        <div className="grid gap-2">
          <Label htmlFor="imprint">{t("site.imprint")}</Label>
          <Textarea id="imprint" name="imprint" rows={8} maxLength={20000} defaultValue={site?.imprint ?? imprintDraft(billing, ctx.org.name)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="privacy">{t("site.privacy")}</Label>
          <Textarea id="privacy" name="privacy" rows={8} maxLength={60000} defaultValue={site?.privacy ?? ""} placeholder={t("site.privacyPlaceholder")} />
        </div>
      </FormCard>
      <SaveBar always={!site} label={!site ? t("site.saveFirst") : undefined} />
    </form>
  )
}

export const instant = false
