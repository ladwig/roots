import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param, ROOT_DOMAIN } from "@/lib/url"
import { ImageForm } from "@/components/image-form"
import { updateLogo, updateOrg } from "./actions"

export default async function GeneralSettings({ searchParams }: PageProps<"/settings/general">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const canEdit = ctx.can("org.settings.manage")

  const { data: org } = await ctx.supabase.from("orgs").select("logo_path").eq("id", ctx.org.id).single()

  return (
    <div className="grid max-w-md gap-6">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {canEdit ? (
        <ImageForm
          action={updateLogo}
          id="logo"
          label={t("general.logo")}
          hint={t("general.logoHint")}
          name={ctx.org.name}
          path={org?.logo_path}
          square
        />
      ) : null}
      <form action={updateOrg} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t("general.name")}</Label>
          <Input id="name" name="name" defaultValue={ctx.org.name} required maxLength={100} disabled={!canEdit} />
        </div>
        <div className="grid gap-1">
          <span className="text-sm font-medium">{t("general.publicAddress")}</span>
          <span className="text-sm text-muted-foreground">
            {ctx.org.slug}.{ROOT_DOMAIN}
          </span>
        </div>
        {canEdit && (
          <Button type="submit" className="justify-self-start">
            {t("common.save")}
          </Button>
        )}
      </form>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
