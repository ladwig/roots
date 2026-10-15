// Pure rules for signing up from an invite link (the invited email is fixed). Tested in signup.test.mjs.

import { MIN_PASSWORD } from "../lib/inputs.ts"

export function inviteSignupProblem(input: { email: string; password: string }, inviteEmail: string) {
  // The form shows the email read-only; this is the real check (a POST can carry anything).
  if (input.email.trim().toLowerCase() !== inviteEmail.toLowerCase()) return "email_mismatch" as const
  if (input.password.length < MIN_PASSWORD) return "password_short" as const
  return null
}

/** What auth.signUp's result means. An existing account comes back as a user without identities, not as an error. */
export function signupOutcome(data: { session: unknown; user: { identities?: unknown[] | null } | null }) {
  if (data.session) return "signed_in" as const
  if (data.user && data.user.identities?.length === 0) return "exists" as const
  return "sent" as const
}
