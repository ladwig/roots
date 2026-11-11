import assert from "node:assert/strict"
import { test } from "node:test"
import { inviteSignupProblem } from "./signup.ts"

test("invite signup: email must be the invited one, password ≥ 8", () => {
  const ok = { email: "erika@example.org", password: "12345678" }
  assert.equal(inviteSignupProblem(ok, "erika@example.org"), null)
  assert.equal(inviteSignupProblem({ ...ok, email: " Erika@Example.org " }, "erika@example.org"), null) // case + spaces
  assert.equal(inviteSignupProblem({ ...ok, email: "mallory@example.org" }, "erika@example.org"), "email_mismatch")
  assert.equal(inviteSignupProblem({ ...ok, password: "1234567" }, "erika@example.org"), "password_short")
})

