// node --test src/i18n  (Node strips the TypeScript types)
import { test } from "node:test"
import assert from "node:assert/strict"
import { createT, dbError } from "./translate.ts"

const dict = {
  greet: "Hallo {name}",
  roles: { memberCount: { one: "{count} Mitglied", other: "{count} Mitglieder" } },
  permissions: { "org.settings.manage": "Einstellungen bearbeiten" },
  errors: { generic: "Fehler", not_allowed: "Verboten", invite_wrong_email: "Ging an {detail}" },
}

test("translate", () => {
  const t = createT("de", dict)
  assert.equal(t("greet", { name: "Ada" }), "Hallo Ada")
  assert.equal(t("roles.memberCount", { count: 1 }), "1 Mitglied")
  assert.equal(t("roles.memberCount", { count: 3 }), "3 Mitglieder")
  assert.equal(t.dynamic("permissions.org.settings.manage"), "Einstellungen bearbeiten")
  assert.equal(t.dynamic("missing.key"), "missing.key")
  assert.equal(t.list(["Events", "Zahlungen"]), "Events und Zahlungen")
  assert.equal(dbError(t, { message: "invite_wrong_email", details: "a@b.c" }), "Ging an a@b.c")
  assert.equal(dbError(t, { code: "42501", message: "new row violates row-level security policy" }), "Verboten")
})
