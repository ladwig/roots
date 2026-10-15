# Einladung annehmen ohne Umwege – Spec

Stand: 2026-10-15 · Status: entschieden: Option A (E-Mail fest). Umsetzung in zwei Phasen: Phase 1 = Registrierung auf der Einladungsseite, Bestätigung weiter über `/auth/callback` (PKCE), bei Fehler bleibt `next` erhalten. Phase 2 = `/auth/confirm` + Mail-Template (Abschnitt 2). Plan: `docs/superpowers/plans/2026-10-15-invite-signup.md`

## Problem

Heute braucht eine eingeladene Person ohne Konto sechs Schritte und muss zweimal von vorne anfangen:

1. Einladungslink öffnen → `/invite/<token>` zeigt „{org} beitreten“ und nur den Button „Anmelden oder Konto erstellen“.
2. Weiterleitung auf `/login?next=/invite/<token>` (eine andere Seite im Website-Look, ohne Bezug zur Einladung).
3. E-Mail + Passwort eintippen, „Registrieren“ → zurück auf `/login` mit „Wir haben dir einen Link geschickt“.
4. Bestätigungsmail öffnen, Link klicken.
5. Landet oft **nicht** angemeldet in der Einladung (siehe Ursachen), also Einladungslink erneut öffnen.
6. Anmelden, „Einladung annehmen“.

Ziel: **Link öffnen → Konto direkt auf der Einladungsseite anlegen → Mail bestätigen → Klick in der Mail führt angemeldet in den Beitritts-Schritt → „Beitreten“ → in der App.** Die E-Mail-Bestätigung bleibt.

## Ist-Zustand im Code

| Teil | Datei | Was passiert |
|---|---|---|
| Einladungsseite | `src/app/invite/[token]/page.tsx` | `invite_info(token)` → Org, Rolle, eingeladene E-Mail. Angemeldet: Button „Annehmen“. Abgemeldet: nur Link auf `/login?next=/invite/<token>`. |
| Annehmen | `src/app/invite/[token]/actions.ts` → `accept_invite(token)` (DB) | Prüft Token, Ablauf **und dass die E-Mail des Kontos = eingeladene E-Mail ist**, legt `org_members` an, setzt aktive Org, → `/app`. |
| Registrieren | `src/app/login/actions.ts` `signUp` | `auth.signUp({ emailRedirectTo: APP_URL/auth/callback?next=<next> })`, danach Redirect auf `/login?ok=…`. `next` wird also schon bis in die Mail durchgereicht. |
| Mail-Link | `src/app/auth/callback/route.ts` | Erwartet `?code=` (PKCE) und ruft `exchangeCodeForSession(code)` auf, dann Redirect auf `next`. |
| Onboarding | `src/app/onboarding/page.tsx` | Zeigt per `my_invites()` alle offenen Einladungen an die **bestätigte** E-Mail mit „Beitreten“ (`accept_my_invite`) plus „Org anlegen“. Wer schon in einer Org ist, kommt nach `/app`. |
| Proxy | `src/proxy.ts` | `/invite`, `/auth`, `/login` sind öffentlich und liegen auf dem Bare-Domain an der Wurzel. |

## Warum der Mail-Link heute nicht im Beitritt landet

Der Code reicht `next=/invite/<token>` korrekt bis in die Bestätigungsmail durch. Es scheitert an zwei Stellen außerhalb dieser Kette:

1. **PKCE bindet den Link an den Browser, der registriert hat.** `signUp` legt den Code-Verifier als Cookie im registrierenden Browser ab. `exchangeCodeForSession` klappt nur dort. Öffnet man die Mail im Mail-App-Browser, auf dem Handy oder in einem anderen Browser, wirft der Callback auf `/login?error=Link ungültig`. Die E-Mail ist dann trotzdem bestätigt, aber man ist nicht angemeldet und hat den Einladungs-Kontext verloren. Genau das ist der beschriebene Schritt 5.
2. **Redirect-Allowlist in Supabase (zu prüfen).** Lokal und in Produktion läuft dasselbe gehostete Supabase-Projekt (`vuuegaemzacbgauycdpc`). Steht `http://localhost:3000/**` nicht unter *Auth → URL Configuration → Redirect URLs*, ignoriert Supabase `emailRedirectTo` und schickt auf die Site URL (vermutlich `https://roots-berlin.vercel.app`). Ohne `next` und ohne Session ist der Einladungs-Kontext weg. `supabase/config.toml` gilt nur für den lokalen Stack, nicht für das gehostete Projekt.

## Lösung

### 1. Konto direkt auf der Einladungsseite anlegen (kein erster Redirect)

`/invite/<token>` zeigt abgemeldet statt des Buttons ein **Registrierungsformular** im Kontext der Einladung:

- Überschrift bleibt „{org} beitreten“, darunter „Du bist als {Rolle} eingeladen.“
- Felder: E-Mail (siehe offene Entscheidung), Passwort (min. 8 Zeichen, `autocomplete="new-password"`), optional Name (`full_name` als `options.data`, damit die Mitgliederliste gleich einen Namen zeigt).
- Button „Konto erstellen & beitreten“.
- Darunter klein: „Schon ein Konto? Anmelden“ → der bisherige Link `/login?next=/invite/<token>` (für Bestandskonten bleibt der Weg, wie er ist).

Neue Server Action `signUpForInvite(formData)` in `src/app/invite/[token]/actions.ts`:

- Lädt `invite_info(token)` neu und bricht bei ungültiger Einladung ab. Der Token kommt als Hidden-Field mit, nicht über `bind`; siehe AGENTS.md: plain form post.
- Prüft die E-Mail (siehe Entscheidung) und das Passwort, wie `signUp` in `login/actions.ts`. Die gemeinsame Prüfung wird nicht kopiert, sondern als kleine Funktion aus `login/actions.ts` exportiert.
- `auth.signUp({ email, password, options: { emailRedirectTo: APP_URL/auth/confirm?next=/invite/<token>, data: { full_name } } })`.
- Kommt sofort eine Session zurück (Bestätigung abgeschaltet), geht es direkt auf `/invite/<token>`, und dort steht dann „Beitreten“.
- Sonst Redirect auf `/invite/<token>?sent=1`. Die Seite zeigt dann den Zustand **„Fast geschafft – bestätige deine E-Mail“**: an welche Adresse die Mail ging, „Mail nicht bekommen? Erneut senden“ (`auth.resend({ type: "signup", email })`) und den Hinweis, dass der Link auf jedem Gerät funktioniert.
- Fehler `user_already_exists` / `email_exists`: Hinweis „Für diese Adresse gibt es schon ein Konto“ mit Link auf Anmelden, `next` bleibt erhalten.

### 2. Bestätigungslink, der auf jedem Gerät funktioniert

Für Bestätigungsmails stellen wir von PKCE (`?code=`) auf den **Token-Hash-Flow** um. Er braucht keinen Verifier-Cookie und funktioniert deshalb in jedem Browser:

- Neue Route `src/app/auth/confirm/route.ts` (GET): liest `token_hash`, `type` und `next`, ruft `supabase.auth.verifyOtp({ type, token_hash })` auf. Bei Erfolg folgen `adoptProfileLocale()` und ein Redirect auf `safeNext(next)`, bei Fehler `/login?error=auth.linkInvalid`. Das ist dasselbe Muster wie in `auth/callback/route.ts`, das für OAuth und Magic Links bleibt.
- **Supabase Dashboard (manuell, gehostetes Projekt):** Auth → Email Templates → „Confirm signup“, Link ändern auf
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`.
  `RedirectTo` ist unser `…/auth/confirm?next=…`, daher `&`.
  Prüfen: Das Template gilt für **alle** Registrierungen. `signUp` in `login/actions.ts` muss deshalb ebenfalls auf `/auth/confirm` zeigen, sonst bricht die normale Registrierung.
- **Supabase Dashboard:** Auth → URL Configuration → Redirect URLs muss `http://localhost:3000/**` und `https://roots-berlin.vercel.app/**` enthalten (später die eigene Domain).
- **Mail-Scanner:** Outlook/Defender „Safe Links“ rufen Links per GET auf. `verifyOtp` ist einmalig, ein Scanner könnte den Link also verbrauchen. Das Portal löst das schon mit einer Seite plus Button (`src/portal/session.ts`). Für v1 bleibt es beim GET, denn bei einem verbrauchten Link ist die Adresse trotzdem bestätigt. Fallback: Auf `/login?error=…&next=…` landen, dort anmelden, man ist zurück im Beitritt. Wenn das in der Praxis auftritt, `/auth/confirm` auf „Seite mit Button → POST“ umstellen.

### 3. Aus der Mail direkt in den Beitritt

`next` ist `/invite/<token>`. Nach dem Klick in der Mail ist man angemeldet auf genau der Seite, die „{org} beitreten · als {Rolle}“ und den Button **„Beitreten“** zeigt. Das ist der gewünschte Bestätigungs-Schritt. Danach `accept_invite` → aktive Org → `/app`.

Warum nicht `/onboarding`: Das Onboarding zeigt die Einladung zwar auch (über die bestätigte E-Mail), aber daneben das Formular „Organisation anlegen“. Für jemanden, der eingeladen wurde, ist das die falsche Frage. Die Einladungsseite ist der fokussierte Beitritts-Schritt. `/onboarding` bleibt das Sicherheitsnetz: Wer den Token-Link verliert und sich normal anmeldet, sieht die Einladung dort.

Kleinigkeit: Eingeloggte Personen, die schon Mitglied der Org sind, bekommen auf `/invite/<token>` heute trotzdem „Annehmen“. `accept_invite` macht `on conflict do nothing` und verbraucht die Einladung. Das ist harmlos und kein Teil dieser Spec.

## Offene Entscheidung: E-Mail vorgeben?

`accept_invite` und `accept_my_invite` erlauben den Beitritt heute **nur mit genau der eingeladenen E-Mail**. Davon hängt ab, was das Formular sinnvollerweise anbietet.

| Option | Formular | DB | Folgen |
|---|---|---|---|
| **A – fest (Empfehlung)** | E-Mail vorausgefüllt und schreibgeschützt (eingeladene Adresse aus `invite_info`) | keine Änderung | Passt zur heutigen Regel; „Falsche Adresse? Bitte um eine neue Einladung.“ Eine zweite, privat genutzte Adresse geht nicht. |
| B – vorausgefüllt, änderbar | vorausgefüllt, editierbar | `accept_invite` prüft nur noch den Token (wer den Link hat, darf annehmen) | Bequemer. Ein weitergeleiteter Link reicht dann zum Beitritt, das Token ist das Geheimnis. `accept_my_invite` bleibt an die E-Mail gebunden. Braucht eine Migration plus einen Test in `supabase/tests/isolation.sql`. |
| C – frei | leer | wie B | wie B, nur ohne Komfort |

Empfehlung **A**: Sie ist sicherer, braucht keine Migration und lässt sich später auf B erweitern, ohne das Formular umzubauen (nur `readOnly` entfernen). Die Server Action prüft bei A zusätzlich `email === invite.email`, denn das Formular allein ist keine Grenze.

## Was dafür nötig ist (Überblick)

| # | Änderung | Dateien |
|---|---|---|
| 1 | Formular „Konto erstellen & beitreten“ und Zustand „Mail gesendet“ auf der Einladungsseite | `src/app/invite/[token]/page.tsx`, ggf. `signup-form.tsx` daneben |
| 2 | Server Actions `signUpForInvite`, `resendConfirmation` | `src/app/invite/[token]/actions.ts`, gemeinsame Prüfung aus `src/app/login/actions.ts` |
| 3 | Route `/auth/confirm` (Token-Hash-Flow) | `src/app/auth/confirm/route.ts` (neu); `/auth` ist im Proxy schon öffentlich |
| 4 | Normale Registrierung auch auf `/auth/confirm` umstellen | `src/app/login/actions.ts` (`signUp`) |
| 5 | Texte DE + EN | `src/i18n/messages/{de,en}.json` unter `invite.*` |
| 6 | Supabase Dashboard: Mail-Template „Confirm signup“ und Redirect-URLs | manuell, dokumentieren in AGENTS.md › Deployment |
| 7 | (nur Option B) Migration für `accept_invite` und Isolationstest | `supabase/migrations/…`, `supabase/tests/isolation.sql` |

Nicht nötig: Änderungen an Proxy, Onboarding oder DB (bei Option A).

## Akzeptanzkriterien

- Abgemeldet auf `/invite/<token>` kann ich ohne Seitenwechsel ein Konto anlegen.
- Danach sehe ich auf derselben Seite „Bestätige deine E-Mail an …“ und kann die Mail erneut senden.
- Der Link in der Bestätigungsmail führt mich **auch in einem anderen Browser oder auf einem anderen Gerät** angemeldet auf `/invite/<token>` mit „Beitreten“.
- „Beitreten“ → ich bin Mitglied, die Org ist aktiv, ich bin in `/app`.
- Normale Registrierung über `/login` funktioniert weiter (Mail-Link → angemeldet → `/onboarding`).
- Abgelaufene oder benutzte Einladung: Die Seite zeigt wie bisher „Einladung ungültig“, ein Registrierungsformular erscheint nicht.
- Option A: Ein manipulierter POST mit anderer E-Mail wird abgelehnt.
- Schon registrierte E-Mail: Hinweis mit Link auf Anmelden, danach zurück im Beitritt.
- 375 / 768 / 1280 px, hell und dunkel.

## Nicht Teil davon

- Bestätigung überspringen, weil der Einladungslink per Mail kam: Das würde den Besitz des Postfachs beweisen, aber nicht bei manuell kopierten Links. Die Bestätigung bleibt, wie gewünscht.
- Magic Link oder OAuth auf der Einladungsseite (später möglich, `next` funktioniert dort schon).
- Design der Einladungsseite im Website-Look (bleibt beim App-Look wie heute).
