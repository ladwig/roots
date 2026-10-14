import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, ROOT_DOMAIN } from "@/lib/url"
import { ImageForm } from "@/components/image-form"
import { updateLogo, updateOrg } from "./actions"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"

export default async function GeneralSettings({ searchParams }: PageProps<"/settings/general">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const canEdit = ctx.can("org.settings.manage")

  const { data: org } = await ctx.supabase.from("orgs").select("logo_path").eq("id", ctx.org.id).single()

  return (
    <div className="grid gap-6">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={updateOrg} className="grid gap-6">
        <FormCard id="org" title={t("general.org")}>
          <div className="grid gap-2">
            <Label htmlFor="name">{t("general.name")}</Label>
            <Input id="name" name="name" defaultValue={ctx.org.name} required maxLength={100} disabled={!canEdit} />
          </div>
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t("general.publicAddress")}</span>
            <span className="font-mono text-sm text-muted-foreground">
              {ctx.org.slug}.{ROOT_DOMAIN}
            </span>
          </div>
        </FormCard>
        {canEdit && <SaveBar />}
      </form>
      {canEdit ? (
        <FormCard id="logo-card" title={t("general.logo")}>
          <ImageForm
          action={updateLogo}
          id="logo"
          label={t("general.logo")}
          hint={t("general.logoHint")}
          name={ctx.org.name}
            path={org?.logo_path}
            square
          />
        </FormCard>
      ) : null}
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
