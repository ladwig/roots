import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { LocaleSwitcher } from "@/i18n/client"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { updateName, updatePassword } from "./actions"

// Personal settings (name, language, password). Used by /settings/profile and /account (no org needed).
export async function ProfileForms({ sp, path }: { sp: SearchParams; path: "/settings/profile" | "/account" }) {
  const session = (await getSession())!
  const t = await getT()
  const { data: profile } = await session.supabase.from("profiles").select("full_name").eq("id", session.userId).maybeSingle()
  const resetting = param(sp, "reset") === "1"

  return (
    <div className="grid max-w-md gap-8">
      <Notice error={param(sp, "error")} ok={param(sp, "ok") ?? (resetting ? t("account.resetHint") : undefined)} />

      <section id="profile" className="grid gap-3">
        <h2 className="font-medium">{t("account.profile")}</h2>
        <p className="text-sm text-muted-foreground">{session.email}</p>
        <form action={updateName} className="grid gap-3">
          <input type="hidden" name="back" value={path} />
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
          <input type="hidden" name="back" value={path} />
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
    </div>
  )
}
