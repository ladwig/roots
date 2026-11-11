// Pure rules for signing up from an invite link (the invited email is fixed). Tested in signup.test.mjs.

import { MIN_PASSWORD } from "../lib/inputs.ts"

export function inviteSignupProblem(input: { email: string; password: string }, inviteEmail: string) {
  // The form shows the email read-only; this is the real check (a POST can carry anything).
  if (input.email.trim().toLowerCase() !== inviteEmail.toLowerCase()) return "email_mismatch" as const
  if (input.password.length < MIN_PASSWORD) return "password_short" as const
  return null
}

