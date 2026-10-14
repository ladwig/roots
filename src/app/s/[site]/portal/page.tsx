import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpenIcon, IdCardIcon, LogOutIcon, QrCodeIcon, ReceiptIcon, UserIcon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { param, sitePath } from "@/lib/url"
import { PORTAL_SECTIONS } from "@/portal/sections"
import { getPortalContact } from "@/portal/session"
import { PortalLoginForm } from "@/portal/login-form"
import { getSite } from "../data"
import { logout } from "./actions"

// Customer portal of one org: email → magic link → the sections of the org's enabled modules (members, later tickets…).
export default async function Portal({ params, searchParams }: PageProps<"/s/[site]/portal">) {
  const { site } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const t = await getT()
  const me = await getPortalContact(s.org.id)
  const body = () => <PortalBody site={site} sp={sp} org={s.org} me={me} />
  return (
    <main className={`mx-auto grid gap-6 px-4 ${me ? "max-w-2xl py-8" : "max-w-md py-16"}`}>
      {!me && (
        <header className="grid gap-1">
          <p className="text-sm text-muted-foreground">{s.org.name}</p>
          <h1 className="font-heading text-2xl font-semibold">{t("portal.title")}</h1>
        </header>
      )}
      {body()}
    </main>
  )
}

// Signed out: email → magic link. Signed in: greeting + the sections of the org's enabled modules.
async function PortalBody({
  site,
  sp,
  org,
  me,
}: {
  site: string
  sp: Awaited<PageProps<"/s/[site]/portal">["searchParams"]>
  org: { id: string; name: string }
  me: Awaited<ReturnType<typeof getPortalContact>>
}) {
  const t = await getT()
  if (!me)
    return (
      <div className="grid gap-4">
        <Notice error={param(sp, "error")} />
        {param(sp, "sent") ? (
          <p className="rounded-lg border bg-muted px-4 py-3">{t("portal.linkSent")}</p>
        ) : (
          <PortalLoginForm site={site} />
        )}
      </div>
    )
  const { data: mods } = await createAdminClient().from("org_modules").select("module_key").eq("org_id", org.id)
  const enabled = new Set(mods?.map((m) => m.module_key))
  const sections = PORTAL_SECTIONS.filter((x) => enabled.has(x.module))
  const tabs = sections.flatMap((x) => x.tabs)
  const tab = tabs.find((x) => x.key === param(sp, "tab"))?.key ?? tabs[0]?.key ?? ""
  return (
    <div className="grid gap-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-sm text-muted-foreground">{org.name}</p>
          <h1 className="font-heading text-xl font-semibold">{t("portal.hello", { name: me.contact.first_name || me.contact.email || "" })}</h1>
        </div>
        <form action={logout}>
          <input type="hidden" name="site" value={site} />
          <SubmitButton size="sm" variant="ghost">
            <LogOutIcon /> {t("portal.signOut")}
          </SubmitButton>
        </form>
      </header>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {sections.map(({ module, Section }) => (
        <Section key={module} orgId={org.id} orgName={org.name} site={site} contact={me.contact} tab={tab} />
      ))}
      {!sections.length && <p className="text-muted-foreground">{t("portal.nothing")}</p>}
      {tabs.length > 1 && (
        // App-like tab bar at the bottom: the card opens alone (to show at the door), the rest is one tap away.
        <nav aria-label={t("portal.title")} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="mx-auto flex max-w-2xl">
            {tabs.map((x) => {
              const Icon = ICONS[x.icon]
              return (
                <li key={x.key} className="flex-1">
                  <Link
                    href={`${sitePath(site, "/portal")}?tab=${x.key}`}
                    aria-current={x.key === tab ? "page" : undefined}
                    className="flex flex-col items-center gap-1 px-1 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-primary"
                  >
                    <Icon className="size-5" aria-hidden />
                    {t.dynamic(x.label)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

const ICONS = { card: QrCodeIcon, member: IdCardIcon, dues: ReceiptIcon, user: UserIcon, book: BookOpenIcon }

export const instant = false
