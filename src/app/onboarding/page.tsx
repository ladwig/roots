import { redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { param, ROOT_DOMAIN } from "@/lib/url"
import { acceptMyInvite, createOrg } from "./actions"
import { SubmitButton } from "@/components/submit-button"

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const session = await getSession()
  if (!session) redirect("/login?next=/onboarding")
  const sp = await searchParams
  const t = await getT()
  const { data: invites } = await session.supabase.rpc("my_invites")

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">{t("onboarding.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
      </div>
      <Notice error={param(sp, "error")} />
      {!!invites?.length && (
        <section aria-labelledby="invites" className="grid gap-3">
          <h2 id="invites" className="font-medium">
            {t("onboarding.invites")}
          </h2>
          {invites.map((i) => (
            <form key={i.id} action={acceptMyInvite} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <input type="hidden" name="id" value={i.id} />
              <span className="grid text-sm">
                <span className="font-medium">{i.org_name}</span>
                <span className="text-muted-foreground">{t.pick(i.role_name as never)}</span>
              </span>
              <SubmitButton size="sm">{t("onboarding.join")}</SubmitButton>
            </form>
          ))}
          <p className="pt-3 text-sm text-muted-foreground">{t("onboarding.orCreate")}</p>
        </section>
      )}
      <form action={createOrg} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t("onboarding.name")}</Label>
          <Input id="name" name="name" required maxLength={100} placeholder={t("onboarding.namePlaceholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slug">{t("onboarding.address")}</Label>
          <div className="flex items-center gap-2">
            <Input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder={t("onboarding.addressPlaceholder")} />
            <span className="text-sm whitespace-nowrap text-muted-foreground">.{ROOT_DOMAIN}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("onboarding.addressHelp")}</p>
        </div>
        <SubmitButton>{t("onboarding.submit")}</SubmitButton>
      </form>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
