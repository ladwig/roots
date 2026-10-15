# Einladung annehmen ohne Umwege – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine eingeladene Person ohne Konto legt ihr Konto direkt auf `/invite/<token>` an. Der Link in der Bestätigungsmail führt sie angemeldet zurück auf diese Seite mit „Beitreten“.

**Phasen:**
- **Phase 1 (dieser Plan, Tasks 1–4):** Kein Eingriff ins Supabase-Mail-Template. Die Bestätigung läuft weiter über den bestehenden PKCE-Flow (`/auth/callback`). Der Mail-Link meldet deshalb nur in dem Browser an, in dem registriert wurde. In jedem anderen Browser landet man auf `/login` mit Hinweis, und **`next` bleibt erhalten**: Nach dem Anmelden ist man zurück im Beitritt, die Adresse ist da schon bestätigt.
- **Phase 2 (unten, nicht Teil der Umsetzung):** `/auth/confirm` mit Token-Hash-Flow und geändertem Mail-Template, damit der Link auf jedem Gerät direkt anmeldet.

**Architecture:** Die Einladungsseite bekommt ein Registrierungsformular. Die E-Mail-Adresse ist fest die eingeladene, Option A der Spec. Eine Server Action ruft `auth.signUp` mit `emailRedirectTo = /auth/callback?next=/invite/<token>` auf. `/auth/callback` gibt bei einem Fehler `next` an `/login` weiter, statt es zu verwerfen.

**Tech Stack:** Next.js 16 App Router (Server Actions, Route Handler), `@supabase/ssr`, `node --test`, i18n-JSON.

**Spec:** `docs/superpowers/specs/2026-10-15-invite-signup-design.md`

## Global Constraints

- Option A: Die E-Mail ist die eingeladene Adresse, das Feld ist `readOnly`, und die Server Action prüft serverseitig `email === invite.email`.
- Keine DB-Migration.
- Passwort mindestens 8 Zeichen, wie in `login/actions.ts`.
- Kein hartkodierter UI-Text: jeder String steht in `src/i18n/messages/de.json` und `en.json`.
- Server Actions sind plain form posts: den Token als Hidden-Field `token` mitgeben, nicht `action.bind`.
- Formular-Buttons sind `<SubmitButton>` (`@/components/submit-button`), nie `<Button type="submit">`.
- Ergebnisse über die URL melden (`?error=` / `?ok=` + `<Notice>`), Zustände ebenfalls (`?sent=<email>`).
- Weiterleitungsziele immer mit `safeNext()` (`src/lib/url.ts`).
- `npm run lint`, `npm run build` und `npm test` müssen vor jedem Commit grün sein.
- Commits ohne AI-Attribution (AGENTS.md › Conventions).
- Prüfung bei 375, 768 und 1280 px, jeweils hell und dunkel.

## Review Focus

1. **Mail-Link in einem anderen Browser oder auf dem Handy (Phase 1):** Erwartet wird `/login` mit Hinweis; nach dem Anmelden landet man auf `/invite/<token>` mit „Beitreten“. Getestet wird manuell in Task 4, Schritt 3, denn der PKCE-Tausch lässt sich nicht als Unit-Test prüfen.
2. **Adresse hat schon ein Konto:** Supabase meldet dabei je nach Projekt-Einstellung keinen Fehler, sondern einen User mit `identities: []`. Erwartet wird der Hinweis „Für diese E-Mail gibt es schon ein Konto“ plus der Weg zum Anmelden. Abgedeckt durch `signupOutcome()` und dessen Test in Task 1.
3. **Manipulierter POST mit anderer E-Mail:** Erwartet wird, dass der Server ablehnt. Abgedeckt durch `inviteSignupProblem()` und dessen Test in Task 1.
4. **Groß- und Kleinschreibung in der E-Mail:** Einladungen speichern sie klein, die Eingabe könnte anders geschrieben sein. Erwartet wird, dass die Schreibweise keine Rolle spielt. Abgedeckt durch den Test in Task 1.
5. **Einladung abgelaufen oder zurückgezogen zwischen Registrierung und Mail-Klick:** Erwartet wird „Einladung ungültig“, nicht abstürzen. Die Seite rendert das heute schon. Manuell geprüft in Task 4, Schritt 3.

---

## File Structure

| Datei | Aufgabe |
|---|---|
| `src/invites/signup.ts` (neu) | Reine Regeln: Prüfung der Eingabe gegen die Einladung, Auswertung des `signUp`-Ergebnisses. Keine Imports aus Next oder Supabase. |
| `src/invites/signup.test.mjs` (neu) | `node --test` für die Datei oben |
| `src/lib/url.ts` | `callbackUrl()` (aus `login/actions.ts` hierher, neben `safeNext`) |
| `src/app/login/actions.ts` | nutzt `callbackUrl()` aus `@/lib/url` |
| `src/app/auth/callback/route.ts` | bei Fehler `next` an `/login` weitergeben |
| `src/app/invite/[token]/actions.ts` | `signUpForInvite`, `resendInviteConfirmation` |
| `src/app/invite/[token]/page.tsx` | Formular (abgemeldet) und Zustand „Mail gesendet“ |
| `src/i18n/messages/de.json`, `en.json` | neue `invite.*`-Texte |
| `AGENTS.md` | Deployment: Redirect-URLs in Supabase |

---

### Task 1: Reine Registrierungsregeln

**Files:**
- Create: `src/invites/signup.ts`
- Test: `src/invites/signup.test.mjs`

**Interfaces:**
- Produces:
  - `inviteSignupProblem(input: { email: string; password: string }, inviteEmail: string): "email_mismatch" | "password_short" | null`
  - `signupOutcome(data: { session: unknown; user: { identities?: unknown[] | null } | null }): "signed_in" | "exists" | "sent"`

- [ ] **Step 1: Write the failing test**

`src/invites/signup.test.mjs`:

```js
import assert from "node:assert/strict"
import { test } from "node:test"
import { inviteSignupProblem, signupOutcome } from "./signup.ts"

test("invite signup: email must be the invited one, password ≥ 8", () => {
  const ok = { email: "erika@example.org", password: "12345678" }
  assert.equal(inviteSignupProblem(ok, "erika@example.org"), null)
  assert.equal(inviteSignupProblem({ ...ok, email: " Erika@Example.org " }, "erika@example.org"), null) // case + spaces
  assert.equal(inviteSignupProblem({ ...ok, email: "mallory@example.org" }, "erika@example.org"), "email_mismatch")
  assert.equal(inviteSignupProblem({ ...ok, password: "1234567" }, "erika@example.org"), "password_short")
})

test("invite signup: outcome of auth.signUp", () => {
  assert.equal(signupOutcome({ session: {}, user: { identities: [{}] } }), "signed_in") // confirmations off
  assert.equal(signupOutcome({ session: null, user: { identities: [{}] } }), "sent")
  // Supabase hides existing accounts: no error, but a user without identities.
  assert.equal(signupOutcome({ session: null, user: { identities: [] } }), "exists")
  assert.equal(signupOutcome({ session: null, user: null }), "sent")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --no-warnings src/invites/signup.test.mjs`
Expected: FAIL with `Cannot find module …/src/invites/signup.ts`

- [ ] **Step 3: Write minimal implementation**

`src/invites/signup.ts`:

```ts
// Pure rules for signing up from an invite link (Option A: the invited email is fixed). Tested in signup.test.mjs.

export const MIN_PASSWORD = 8

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --no-warnings src/invites/signup.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/invites/signup.ts src/invites/signup.test.mjs
git commit -m "Invites: pure rules for signing up from an invite link"
```

---

### Task 2: Mail-Link behält das Ziel (`callbackUrl`, `/auth/callback`)

**Files:**
- Modify: `src/lib/url.ts` (`callbackUrl`)
- Modify: `src/app/login/actions.ts` (lokales `callback` entfernen)
- Modify: `src/app/auth/callback/route.ts`
- Modify: `AGENTS.md` (Abschnitt Deployment)

**Interfaces:**
- Produces: `export const callbackUrl = (next: string) => string` in `src/lib/url.ts`. Liefert `${APP_URL}/auth/callback?next=<encoded next>` und wird in Task 3 genutzt. Es liegt nicht in `login/actions.ts`, weil eine `"use server"`-Datei nur async Funktionen exportieren darf.

`/auth` ist im Proxy schon öffentlich und liegt an der Wurzel (`PUBLIC_PATHS`, `ROOT_PATHS` in `src/proxy.ts`), dort ist nichts zu tun.

- [ ] **Step 1: `callbackUrl` nach `src/lib/url.ts` verschieben**

In `src/lib/url.ts` direkt unter `safeNext` ergänzen:

```ts
// Where email links (sign-up confirmation, magic link, password reset) land; `next` is where they continue.
export const callbackUrl = (next: string) => `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}`
```

In `src/app/login/actions.ts` die Zeile `const callback = (next: string) => …` löschen, `callbackUrl` zum Import aus `@/lib/url` hinzufügen und die drei Aufrufe `callback(` durch `callbackUrl(` ersetzen (in `signUp`, `sendMagicLink`, `sendPasswordReset`). Wird `APP_URL` danach dort nicht mehr genutzt, auch aus dem Import entfernen.

- [ ] **Step 2: `/auth/callback` gibt `next` bei Fehlern weiter**

In `src/app/auth/callback/route.ts` die letzte Zeile ersetzen durch:

```ts
  // Keep `next`: the link may have been opened in another browser (PKCE) or used twice. The address is confirmed
  // anyway, so signing in continues where the link wanted to go (e.g. the invite).
  const back = new URLSearchParams({ error: t("auth.linkInvalid"), ...(next !== APP_HOME && { next }) })
  return NextResponse.redirect(new URL(`/login?${back}`, url.origin))
```

Und den Import zu `import { APP_HOME, safeNext } from "@/lib/url"` erweitern. `/login` liest `next` schon aus der URL und gibt es an das Anmeldeformular weiter.

- [ ] **Step 3: Deployment-Hinweis in AGENTS.md**

In `AGENTS.md` unter `## Deployment` als letzten Punkt anfügen:

```markdown
- Supabase Auth (Dashboard of the hosted project, not `config.toml`): URL Configuration → Redirect URLs must contain `http://localhost:3000/**` and the production URL `/**`, otherwise email links ignore `next` and land on the Site URL.
```

- [ ] **Step 4: Lint + Build**

Run: `npm run lint && npm run build`
Expected: beide ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add src/lib/url.ts src/app/login/actions.ts src/app/auth/callback/route.ts AGENTS.md
git commit -m "Auth: email links keep their target when the callback fails (sign in, then continue)"
```

---

### Task 3: Registrierung auf der Einladungsseite

**Files:**
- Modify: `src/app/invite/[token]/actions.ts`
- Modify: `src/app/invite/[token]/page.tsx`
- Modify: `src/i18n/messages/de.json`, `src/i18n/messages/en.json` (Block `invite`)

**Interfaces:**
- Consumes: `inviteSignupProblem`, `signupOutcome`, `MIN_PASSWORD` aus `@/invites/signup` (Task 1); `callbackUrl` aus `@/lib/url` (Task 2)
- Produces: Server Actions `signUpForInvite(formData)` (Felder `token`, `email`, `password`, `full_name`) und `resendInviteConfirmation(formData)` (Felder `token`, `email`)

- [ ] **Step 1: Texte anlegen**

`de.json`, im Block `"invite"` nach `"signInFirst"` einfügen:

```json
    "createAccount": "Konto erstellen & beitreten",
    "name": "Dein Name",
    "passwordHint": "Mindestens 8 Zeichen.",
    "haveAccount": "Schon ein Konto?",
    "signIn": "Anmelden",
    "emailFixed": "Die Einladung gilt für diese Adresse. Falsche Adresse? Bitte um eine neue Einladung.",
    "emailMismatch": "Diese Einladung gilt nur für {email}.",
    "accountExists": "Für {email} gibt es schon ein Konto. Melde dich an, um beizutreten.",
    "sentTitle": "Fast geschafft",
    "sentBody": "Wir haben dir einen Link an {email} geschickt. Öffne ihn am besten in diesem Browser, dann kannst du {org} beitreten.",
    "resend": "Mail erneut senden",
    "resent": "Neue Mail ist unterwegs.",
    "join": "Beitreten",
```

`en.json`, gleiche Stelle:

```json
    "createAccount": "Create account & join",
    "name": "Your name",
    "passwordHint": "At least 8 characters.",
    "haveAccount": "Already have an account?",
    "signIn": "Sign in",
    "emailFixed": "The invite is for this address. Wrong address? Ask for a new invite.",
    "emailMismatch": "This invite is only for {email}.",
    "accountExists": "{email} already has an account. Sign in to join.",
    "sentTitle": "Almost there",
    "sentBody": "We sent a link to {email}. Best open it in this browser, then you can join {org}.",
    "resend": "Resend email",
    "resent": "A new email is on its way.",
    "join": "Join",
```

- [ ] **Step 2: Server Actions**

`src/app/invite/[token]/actions.ts`: Imports ergänzen und zwei Actions anhängen. `acceptInvite` bleibt unverändert.

```ts
import { authError } from "@/i18n/translate"
import { createClient } from "@/lib/supabase/server"
import { inviteSignupProblem, signupOutcome } from "@/invites/signup"

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
  const sent = `${invitePath(token)}?${new URLSearchParams({ sent: invite.email })}`
  back(sent, error ? { error: authError(t, error) } : { ok: t("invite.resent") })
}
```

`back`, `redirect` und `getT` sind in der Datei schon importiert; die bestehende Zeile `import { back, APP_HOME } from "@/lib/url"` wird zu `import { back, APP_HOME, callbackUrl } from "@/lib/url"`. `back()` und `redirect()` sind `never`, deshalb braucht es nach den `if`s kein `return`.

- [ ] **Step 3: Seite – Formular und Zustand „gesendet“**

In `src/app/invite/[token]/page.tsx` die Imports ergänzen:

```tsx
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MIN_PASSWORD } from "@/invites/signup"
import { acceptInvite, resendInviteConfirmation, signUpForInvite } from "./actions"
```

Dabei die alte Zeile `import { acceptInvite } from "./actions"` ersetzen.

Nach `const invite = data?.[0]` ergänzen:

```tsx
  const sent = param(sp, "sent")
```

Den Zweig `) : (` mit dem Button `invite.signInFirst` ersetzen durch:

```tsx
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
                  <p id="invite-email-hint" className="text-xs text-muted-foreground">{t("invite.emailFixed")}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-name">{t("invite.name")}</Label>
                  <Input id="invite-name" name="full_name" autoComplete="name" maxLength={100} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invite-password">{t("auth.password")}</Label>
                  <Input id="invite-password" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" aria-describedby="invite-password-hint" />
                  <p id="invite-password-hint" className="text-xs text-muted-foreground">{t("invite.passwordHint")}</p>
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
```

Im angemeldeten Zweig den Button-Text `t("invite.accept")` durch `t("invite.join")` ersetzen, so wie die Spec den Schritt nennt. Danach den nicht mehr genutzten `Button`-Import entfernen und den Schlüssel `invite.signInFirst` in beiden JSON-Dateien löschen, falls `grep -rn "invite.signInFirst" src` sonst nichts findet. `invite.accept` genauso.

`<Notice ok>` zeigt „Neue Mail ist unterwegs“. Dazu `<Notice error={param(sp, "error")} />` erweitern zu `<Notice error={param(sp, "error")} ok={param(sp, "ok")} />`.

- [ ] **Step 4: Lint, Build, Tests**

Run: `npm run lint && npm run build && npm test`
Expected: alles grün. Der Build prüft auch, dass `en.json` keinen Schlüssel vermisst.

- [ ] **Step 5: Commit**

```bash
git add src/app/invite src/i18n/messages/de.json src/i18n/messages/en.json
git commit -m "Invite page: create the account right there; the confirmation mail leads back to joining"
```

---

### Task 4: Redirect-URLs prüfen und Ende-zu-Ende testen

**Files:** keine (Dashboard + manuelle Prüfung)

- [ ] **Step 1: Supabase-Dashboard (Person mit Zugang, manuell, nur lesen bzw. ergänzen)**

Projekt `vuuegaemzacbgauycdpc` → Auth → URL Configuration → Redirect URLs: `http://localhost:3000/**` und `https://roots-berlin.vercel.app/**` müssen vorhanden sein. Das Mail-Template bleibt unverändert (Phase 2).

- [ ] **Step 2: Lokal starten**

Run: `npm run dev`

- [ ] **Step 3: Manuelle Ende-zu-Ende-Prüfung**

Mit einer Wegwerf-Adresse, die du selbst liest:
1. Settings → Team → einladen → Link kopieren → in einem **privaten Fenster** öffnen. Erwartet: Formular, E-Mail fest vorgegeben.
2. Name und Passwort mit 7 Zeichen eingeben → Fehler „mindestens 8 Zeichen“.
3. Gültiges Passwort → „Fast geschafft“ mit der Adresse; „Mail erneut senden“ → Toast „Neue Mail ist unterwegs“.
4. Den Mail-Link **im selben privaten Fenster** öffnen → angemeldet auf `/invite/<token>`, Button „Beitreten“.
5. „Beitreten“ → `/app`, die Org ist aktiv, Settings → Team zeigt die Person mit Namen.
6. Zweite Einladung an eine neue Adresse, registrieren, Mail-Link in einem **anderen Browser** öffnen → `/login` mit „Link ungültig“; dort anmelden → zurück auf `/invite/<token>` mit „Beitreten“.
7. Gleiche Adresse noch einmal einladen und registrieren → Hinweis „gibt es schon ein Konto“ mit Link „Anmelden“; nach dem Anmelden zurück auf `/invite/<token>`.
8. Einladung zurückziehen, dann einen alten Mail-Link öffnen → Seite „Einladung ungültig“, kein Absturz.
9. Normale Registrierung über `/login` mit einer neuen Adresse → Mail-Link → angemeldet auf `/onboarding`.
10. Mit den DevTools das `readOnly` entfernen und eine andere E-Mail absenden → Fehler „Diese Einladung gilt nur für …“.
11. Die Einladungsseite bei 375, 768 und 1280 px, hell und dunkel, ansehen.

- [ ] **Step 4: Abschluss**

Run: `npm run lint && npm run build && npm test`
Expected: grün. Fehler aus Schritt 3 im zuständigen Task beheben und dort erneut committen.

---

## Phase 2 (später, nicht Teil der Umsetzung): Mail-Link auf jedem Gerät

Ziel: Der Bestätigungslink meldet auch in einem anderen Browser direkt an, ohne den Umweg über `/login`.

1. Neue Route `src/app/auth/confirm/route.ts`:

```ts
import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { adoptProfileLocale } from "@/i18n/actions"
import { getT } from "@/i18n/server"
import { createClient } from "@/lib/supabase/server"
import { APP_HOME, safeNext } from "@/lib/url"

const TYPES: EmailOtpType[] = ["email", "signup"]

// Sign-up confirmation links (Supabase template: {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email).
// Unlike /auth/callback (PKCE) this works in any browser, not only the one that signed up.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const next = safeNext(url.searchParams.get("next"))
  if (token_hash && type && TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      await adoptProfileLocale()
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }
  const t = await getT()
  const back = new URLSearchParams({ error: t("auth.linkInvalid"), ...(next !== APP_HOME && { next }) })
  return NextResponse.redirect(new URL(`/login?${back}`, url.origin))
}
```

2. In `src/lib/url.ts` unter `callbackUrl` ergänzen: `confirmUrl(next)` = `${APP_URL}/auth/confirm?next=<encodeURIComponent(next)>`. Für **Registrierungen** (`signUp` in `login/actions.ts`, `signUpForInvite`, `resendInviteConfirmation`) `callbackUrl` durch `confirmUrl` ersetzen. Magic Link und Passwort-Reset bleiben auf `callbackUrl`.
3. Deployen. **Erst danach** im Supabase-Dashboard Auth → Email Templates → „Confirm signup“ den Link `{{ .ConfirmationURL }}` ersetzen durch `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`. In umgekehrter Reihenfolge bricht jede Registrierung.
4. Texte `invite.sentBody` anpassen („Öffne ihn, auf jedem Gerät“) und den AGENTS.md-Deployment-Punkt um das Template ergänzen.
5. Mail-Scanner (Outlook Safe Links) können den einmaligen Link per GET verbrauchen. Tritt das auf: `/auth/confirm` als Seite mit Button und POST bauen, wie im Portal (`src/portal/session.ts`).
