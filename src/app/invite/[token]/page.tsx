import Link from "next/link"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { param } from "@/lib/url"
import { acceptInvite } from "./actions"

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const sp = await searchParams
  const session = await getSession()
  const supabase = await createClient()
  const { data } = await supabase.rpc("invite_info", { p_token: token })
  const invite = data?.[0]

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      {!invite?.valid ? (
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">Invite not valid</h1>
          <p className="text-sm text-muted-foreground">
            This invite was already used or has expired. Ask the person who invited you for a new link.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold">Join {invite.org_name}</h1>
            <p className="text-sm text-muted-foreground">
              You&apos;re invited as <strong>{invite.role_name}</strong>. The invite was sent to {invite.email}.
            </p>
          </div>
          <Notice error={param(sp, "error")} />
          {session ? (
            <form action={acceptInvite.bind(null, token)} className="grid gap-2">
              <Button type="submit">Accept invite</Button>
              <p className="text-xs text-muted-foreground">Signed in as {session.email}</p>
            </form>
          ) : (
            <Button render={<Link href={`/login?next=/invite/${token}`} />} nativeButton={false}>
              Sign in or create an account
            </Button>
          )}
        </>
      )}
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
