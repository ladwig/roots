import Link from "next/link"
import { redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { LocaleSwitcher } from "@/i18n/client"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { param } from "@/lib/url"
import { updateName, updatePassword } from "./actions"

// Personal settings; works with or without an org.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const t = await getT()
  const sp = await searchParams
  const { data: profile } = await session.supabase.from("profiles").select("full_name").eq("id", session.userId).maybeSingle()
  const resetting = param(sp, "reset") === "1"

  return (
    <main className="mx-auto grid w-full max-w-md gap-8 px-4 py-10">
      <div className="grid gap-1">
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
          {t("account.back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("account.title")}</h1>
        <p className="text-sm text-muted-foreground">{session.email}</p>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok") ?? (resetting ? t("account.resetHint") : undefined)} />

      <section id="profile" className="grid gap-3">
        <h2 className="font-medium">{t("account.profile")}</h2>
        <form action={updateName} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="full-name">{t("account.name")}</Label>
            <Input id="full-name" name="full_name" defaultValue={profile?.full_name ?? ""} maxLength={100} autoComplete="name" />
          </div>
          <Button type="submit" className="justify-self-start">
            {t("common.save")}
          </Button>
        </form>
      </section>
      <Separator />

      <section id="language" className="grid gap-3">
        <h2 className="font-medium">{t("account.language")}</h2>
        <LocaleSwitcher className="justify-self-start" />
      </section>
      <Separator />

      <section id="password" className="grid gap-3">
        <h2 className="font-medium">{t("account.password")}</h2>
        <form action={updatePassword} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("account.newPassword")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus={resetting} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="repeat">{t("account.repeatPassword")}</Label>
            <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <Button type="submit" className="justify-self-start">
            {t("account.changePassword")}
          </Button>
        </form>
      </section>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
