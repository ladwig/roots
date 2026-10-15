"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FingerprintIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/i18n/client"
import { createClient } from "@/lib/supabase/client"

// Sign in with a passkey (Face ID, Touch ID, security key). Also offers passkeys in the email field's autofill
// (WebAuthn conditional UI: the email input has autocomplete="username webauthn"). Session cookies are set by the
// browser client, then we go on to `next`.
export function PasskeySignIn({ next }: { next: string }) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const done = () => {
    router.replace(next || "/")
    router.refresh()
  }

  useEffect(() => {
    const ctrl = new AbortController()
    const pk = (window as { PublicKeyCredential?: { isConditionalMediationAvailable?: () => Promise<boolean> } }).PublicKeyCredential
    pk?.isConditionalMediationAvailable?.().then((ok) => {
      if (!ok || ctrl.signal.aborted) return
      createClient()
        .auth.signInWithPasskey({ options: { mediation: "conditional", signal: ctrl.signal } })
        .then(({ data, error }) => !error && data.session && done())
        .catch(() => null)
    })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      className="pill pill-outline w-full justify-center"
      onClick={async () => {
        setBusy(true)
        const { data, error } = await createClient().auth.signInWithPasskey()
        setBusy(false)
        if (data?.session) return done()
        // Cancelled in the browser's dialog: no message.
        if (error && !/abort|cancel|NotAllowed/i.test(`${error.name} ${error.message}`)) toast.error(t("auth.passkeyFailed"))
      }}
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <FingerprintIcon className="size-4" aria-hidden />}
      <span>{t("auth.passkeySignIn")}</span>
    </button>
  )
}
