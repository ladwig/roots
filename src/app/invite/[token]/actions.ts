"use server"

import { redirect } from "next/navigation"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { authError, dbError } from "@/i18n/translate"
import { setActiveOrg, getSession } from "@/lib/context"
import { back, APP_HOME, callbackUrl } from "@/lib/url"
import { createClient } from "@/lib/supabase/server"
import { inviteSignupProblem } from "@/invites/signup"
import { createAdminClient } from "@/lib/supabase/admin"
import { MIN_PASSWORD } from "@/lib/inputs"

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

/** Create an account from the invite page (the email is the invited one), sign in and join the org. */
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
  if (problem === "password_short") back(invitePath(token), { error: t("auth.passwordTooShort", { min: MIN_PASSWORD }) })

  // The invite reached this address by mail, so the address is proven: create the account confirmed (no second
  // "confirm your email" mail from Supabase), sign in and join in one go.
  const { error } = await createAdminClient().auth.admin.createUser({ email: invite.email, password, email_confirm: true, user_metadata: fullName ? { full_name: fullName } : undefined })
  if (error?.code === "user_already_exists" || error?.code === "email_exists") back(invitePath(token), { error: t("invite.accountExists", { email: invite.email }) })
  if (error) back(invitePath(token), { error: authError(t, error) })
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password })
  if (signInError) back(invitePath(token), { error: authError(t, signInError) })
  await acceptInvite(token)
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
