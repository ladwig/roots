import Link from "next/link"
import { redirect } from "next/navigation"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { ProfileForms } from "./profile-forms"

// Standalone profile page: password reset lands here, and it works for people without an org.
// Inside the app the same forms live under Settings → Profile.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  if (!(await getSession())) redirect("/login?next=/account")
  const t = await getT()
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10">
      <div className="grid gap-1">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          {t("account.back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("account.title")}</h1>
      </div>
      <ProfileForms sp={await searchParams} path="/account" />
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
