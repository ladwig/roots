import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { param } from "@/lib/url"
import { PORTAL_SECTIONS } from "@/portal/sections"
import { getPortalContact } from "@/portal/session"
import { getSite } from "../data"
import { logout, requestLink } from "./actions"

// Customer portal of one org: email → magic link → the sections of the org's enabled modules (members, later tickets…).
export default async function Portal({ params, searchParams }: PageProps<"/s/[site]/portal">) {
  const { site } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const t = await getT()
  const me = await getPortalContact(s.org.id)

  if (!me)
    return (
      <main className="mx-auto grid max-w-md gap-6 px-4 py-16">
        <header className="grid gap-1">
          <p className="text-sm text-muted-foreground">{s.org.name}</p>
          <h1 className="font-heading text-2xl font-semibold">{t("portal.title")}</h1>
        </header>
        <Notice error={param(sp, "error")} />
        {param(sp, "sent") ? (
          <p className="rounded-lg border bg-muted px-4 py-3">{t("portal.linkSent")}</p>
        ) : (
          <form action={requestLink} className="grid gap-4">
            <input type="hidden" name="site" value={site} />
            <p className="text-muted-foreground">{t("portal.intro")}</p>
            <div className="grid gap-2">
              <Label htmlFor="p-email">{t("portal.email")}</Label>
              <Input id="p-email" name="email" type="email" required autoComplete="email" />
            </div>
            <SubmitButton className="justify-self-start">{t("portal.sendLink")}</SubmitButton>
          </form>
        )}
      </main>
    )

  const { data: mods } = await createAdminClient().from("org_modules").select("module_key").eq("org_id", s.org.id)
  const enabled = new Set(mods?.map((m) => m.module_key))
  const sections = PORTAL_SECTIONS.filter((x) => enabled.has(x.module))
  return (
    <main className="mx-auto grid max-w-2xl gap-8 px-4 py-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{s.org.name}</p>
          <h1 className="font-heading text-2xl font-semibold">{t("portal.hello", { name: me.contact.first_name || me.contact.email || "" })}</h1>
        </div>
        <form action={logout}>
          <input type="hidden" name="site" value={site} />
          <SubmitButton size="sm" variant="outline">
            {t("portal.signOut")}
          </SubmitButton>
        </form>
      </header>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {sections.map(({ module, Section }) => (
        <Section key={module} orgId={s.org.id} orgName={s.org.name} site={site} contact={me.contact} />
      ))}
      {!sections.length && <p className="text-muted-foreground">{t("portal.nothing")}</p>}
    </main>
  )
}

export const instant = false
