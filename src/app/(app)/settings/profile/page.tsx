import { ProfileForms } from "@/app/account/profile-forms"
import { FormCard } from "@/components/page"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { Connections } from "../connections"

export default async function ProfileSettings({ searchParams }: PageProps<"/settings/profile">) {
  const ctx = await getContext()
  const t = await getT()
  return (
    <div className="grid gap-8">
      <ProfileForms sp={await searchParams} path="/settings/profile" />
      {/* Which organisations this account belongs to (switch in the sidebar). */}
      <FormCard id="my-orgs" title={t("account.orgs")}>
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
      </FormCard>
      <Connections ctx={ctx} scope="mine" back="/settings/profile" />
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
