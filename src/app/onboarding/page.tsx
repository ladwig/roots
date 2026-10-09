import { redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { param, ROOT_DOMAIN } from "@/lib/url"
import { createOrg } from "./actions"
import { SubmitButton } from "@/components/submit-button"

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  if (!(await getSession())) redirect("/login?next=/onboarding")
  const sp = await searchParams
  const t = await getT()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">{t("onboarding.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
      </div>
      <Notice error={param(sp, "error")} />
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
