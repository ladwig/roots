import Link from "next/link"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { param } from "@/lib/url"
import { sendPasswordReset } from "@/app/login/actions"
import { SubmitButton } from "@/components/submit-button"

export default async function ForgotPage({ searchParams }: PageProps<"/forgot">) {
  const sp = await searchParams
  const t = await getT()
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">{t("auth.forgotTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.forgotSubtitle")}</p>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={sendPasswordReset} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <SubmitButton>{t("auth.sendReset")}</SubmitButton>
      </form>
      <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4">
        {t("auth.backToLogin")}
      </Link>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
