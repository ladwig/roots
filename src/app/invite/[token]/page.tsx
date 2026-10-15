import Link from "next/link"
import { Notice } from "@/components/notice"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { param } from "@/lib/url"
import { MIN_PASSWORD } from "@/lib/inputs"
import { acceptInvite, resendInviteConfirmation, signUpForInvite } from "./actions"
import { SubmitButton } from "@/components/submit-button"

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const sp = await searchParams
  const session = await getSession()
  const t = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc("invite_info", { p_token: token })
  const invite = data?.[0]
  const sent = param(sp, "sent")

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      {!invite?.valid ? (
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">{t("invite.invalidTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("invite.invalidBody")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold">{t("invite.joinTitle", { org: invite.org_name })}</h1>
            <p className="text-sm text-muted-foreground">
              {t("invite.invitedAs", { role: t.pick(invite.role_name), email: invite.email })}
            </p>
          </div>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          {session ? (
            <form action={acceptInvite.bind(null, token)} className="grid gap-2">
              <SubmitButton>{t("invite.join")}</SubmitButton>
              <p className="text-xs text-muted-foreground">{t("invite.signedInAs", { email: session.email })}</p>
            </form>
          ) : sent ? (
            <form action={resendInviteConfirmation} className="grid gap-3">
              <input type="hidden" name="token" value={token} />
              <h2 className="font-medium">{t("invite.sentTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("invite.sentBody", { email: invite.email, org: invite.org_name })}</p>
              <SubmitButton variant="outline">{t("invite.resend")}</SubmitButton>
            </form>
          ) : (
            <div className="grid gap-4">
              <form action={signUpForInvite} className="grid gap-4">
                <input type="hidden" name="token" value={token} />
                <div className="grid gap-2">
                  <Label htmlFor="invite-email">{t("auth.email")}</Label>
                  <Input id="invite-email" name="email" type="email" value={invite.email} readOnly autoComplete="email" aria-describedby="invite-email-hint" />
                  <p id="invite-email-hint" className="text-xs text-muted-foreground">
                    {t("invite.emailFixed")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-name">{t("invite.name")}</Label>
                  <Input id="invite-name" name="full_name" autoComplete="name" maxLength={100} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-password">{t("auth.password")}</Label>
                  <Input id="invite-password" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" aria-describedby="invite-password-hint" />
                  <p id="invite-password-hint" className="text-xs text-muted-foreground">
                    {t("invite.passwordHint", { min: MIN_PASSWORD })}
                  </p>
                </div>
                <SubmitButton>{t("invite.createAccount")}</SubmitButton>
              </form>
              <p className="text-sm text-muted-foreground">
                {t("invite.haveAccount")}{" "}
                <Link href={`/login?next=/invite/${token}`} className="underline underline-offset-4">
                  {t("invite.signIn")}
                </Link>
              </p>
            </div>
          )}
        </>
      )}
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
