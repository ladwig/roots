"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { authError, dbError } from "@/i18n/translate"
import { setActiveOrg, getSession } from "@/lib/context"
import { back, APP_HOME, callbackUrl } from "@/lib/url"
import { createClient } from "@/lib/supabase/server"
import { inviteSignupProblem, signupOutcome } from "@/invites/signup"

export async function acceptInvite(token: string) {
  const session = await getSession()
  if (!session) redirect(`/login?next=/invite/${token}`)
  const { data, error } = await session.supabase.rpc("accept_invite", { p_token: token })
  if (error) back(`/invite/${token}`, { error: dbError(await getT(), error) })
  deliverSoon()
  await setActiveOrg(data!)
  redirect(APP_HOME)
}

const invitePath = (token: string) => `/invite/${token}`

async function openInvite(token: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("invite_info", { p_token: token })
  const invite = data?.[0]
  return { supabase, invite: invite?.valid ? invite : null }
}

/** Create an account from the invite page (the email is the invited one); the mail link brings the person back here. */
export async function signUpForInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 100)
  const t = await getT()
  const { supabase, invite } = await openInvite(token)
  if (!invite) redirect(invitePath(token)) // the page shows "invalid"

  const problem = inviteSignupProblem({ email, password }, invite.email)
  if (problem === "email_mismatch") back(invitePath(token), { error: t("invite.emailMismatch", { email: invite.email }) })
  if (problem === "password_short") back(invitePath(token), { error: t("auth.passwordTooShort") })

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(invitePath(token)), data: fullName ? { full_name: fullName } : undefined },
  })
  if (error?.code === "user_already_exists" || error?.code === "email_exists")
    back(invitePath(token), { error: t("invite.accountExists", { email }) })
  if (error) back(invitePath(token), { error: authError(t, error) })

  const outcome = signupOutcome(data)
  if (outcome === "exists") back(invitePath(token), { error: t("invite.accountExists", { email }) })
  if (outcome === "signed_in") redirect(invitePath(token))
  redirect(`${invitePath(token)}?${new URLSearchParams({ sent: email })}`)
}

export async function resendInviteConfirmation(formData: FormData) {
  const token = String(formData.get("token") ?? "")
  const t = await getT()
  const { supabase, invite } = await openInvite(token)
  if (!invite) redirect(invitePath(token))
  // Always the invited address, whatever the form says.
  const { error } = await supabase.auth.resend({ type: "signup", email: invite.email, options: { emailRedirectTo: callbackUrl(invitePath(token)) } })
  back(`${invitePath(token)}?${new URLSearchParams({ sent: invite.email })}`, error ? { error: authError(t, error) } : { ok: t("invite.resent") })
}
