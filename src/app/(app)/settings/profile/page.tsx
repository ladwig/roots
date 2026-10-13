import { ProfileForms } from "@/app/account/profile-forms"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"

export default async function ProfileSettings({ searchParams }: PageProps<"/settings/profile">) {
  const ctx = await getContext()
  const t = await getT()
  return (
    <div className="grid gap-8">
      <ProfileForms sp={await searchParams} path="/settings/profile" />
      {/* Which organisations this account belongs to (switch in the sidebar). */}
      <section className="grid max-w-xl gap-3" aria-labelledby="my-orgs">
        <h2 id="my-orgs" className="font-medium">
          {t("account.orgs")}
        </h2>
        <ul className="grid gap-1.5">
          {ctx.orgs.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{o.name}</span>
              {o.id === ctx.org.id && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {ctx.role.name}
                  <Badge variant="secondary">{t("account.currentOrg")}</Badge>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("account.orgsHint")}</p>
      </section>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
