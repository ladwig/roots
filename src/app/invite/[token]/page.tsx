import Link from "next/link"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { param } from "@/lib/url"
import { acceptInvite } from "./actions"

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const sp = await searchParams
  const session = await getSession()
  const t = await getT()
  const supabase = await createClient()
  const { data } = await supabase.rpc("invite_info", { p_token: token })
  const invite = data?.[0]

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
              {t("invite.invitedAs", { role: invite.role_name, email: invite.email })}
            </p>
          </div>
          <Notice error={param(sp, "error")} />
          {session ? (
            <form action={acceptInvite.bind(null, token)} className="grid gap-2">
              <Button type="submit">{t("invite.accept")}</Button>
              <p className="text-xs text-muted-foreground">{t("invite.signedInAs", { email: session.email })}</p>
            </form>
          ) : (
            <Button render={<Link href={`/login?next=/invite/${token}`} />} nativeButton={false}>
              {t("invite.signInFirst")}
            </Button>
          )}
        </>
      )}
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
