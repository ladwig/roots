# UX-Audit: Major Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five severity-3 audit findings 3.1, 6.1, 6.2, 7.1 and 11.1: no lost input after a server error or a drawer close, visible inputs in dark mode, real 404/error pages, and confirmations before mass e-mails and money status changes on the dues page.

**Architecture:** Every fix goes into a shared building block, not into individual screens. `<SaveBar>` (in all 34 edit/create forms) marks its form dirty and puts values back after a failed submit. `<UrlSheet>`/`<UrlDialog>` ask before closing a dirty form. `theme.css` gets one new token value. `<ConfirmHost>` learns two extra variables. Only the dues page and new Next.js file conventions are touched beyond that.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components), React 19, Base UI sheet/dialog, Tailwind v4 tokens, `node --test` for pure `.ts` helpers (imported with relative `.ts` paths from `.test.mjs`).

**Spec:** `docs/audits/2026-11-02-app-querschnitt/findings.json`, findings `kontakt-neu-eingaben-weg-bei-serverfehler` (3.1), `drawer-schliesst-ohne-rueckfrage` (6.1), `drawer-dark-eingabefelder-unsichtbar` (6.2), `fehlerseiten-fehlen` (7.1) and `beitraege-erinnerung-alle-ohne-rueckfrage` (11.1). The audit folder is local and untracked (screens contain personal data); read it there and don't commit it.

## Global Constraints

- No hardcoded UI text: every string goes into `src/i18n/messages/de.json` (source) **and** `en.json`; the build fails if `en.json` lacks a key.
- Semantic tokens only (`bg-background`, `text-muted-foreground` …), no raw colors; change the look in `src/app/theme.css`, not per component.
- Icons from `lucide-react` only. Links to the App home use `APP_HOME` from `@/lib/url`.
- Read the Next.js docs in `node_modules/next/dist/docs/` before using a file convention (`not-found`, `error`, `global-error`). `error.tsx` receives `{ error: unknown, retry: () => void }`.
- `npm test`, `npm run lint` and `npm run build` must pass before each commit.
- Commit messages: no AI attribution (no `Co-Authored-By`, no "Generated with"). Work on branch `ux-audit-major-fixes`, not `main` (a push to `main` deploys production).
- Browser checks run against `npm run dev` (preview config `dev`) in a **test org**. Ask the user before submitting forms in a real org; the only submits this plan needs are rejected by validation (3.1) or cancelled in the dialog (11.1).

## Not in this plan

- The other 26 findings, including 10.1 (Kündigen/Karte without confirm) and 2.4 (focus on the red button).
- Browser back button with unsaved changes (App Router can't block `popstate` reliably).
- Replacing `window.confirm` with the App's own dialog.
- Light-mode input contrast: `--input` 0.86 against `--popover` 0.99 is ~1.5:1 and fails WCAG 1.4.11 too. That's a visible design decision for the user, so it's left out here.
- A mail preview in the reminder dialog.

## Review Focus

1. **Successful save after a failed one:** a form that failed, was restored and was then saved successfully (`?ok=`) must show the saved values, not the old snapshot. Pinned by `failedSubmit` tests (Task 2) and a browser step.
2. **Multi-value fields** (checkbox groups, `select multiple`, several hidden `tags` inputs): every value must survive, and hidden inputs that React components own (TagSelect, RichTextEditor, ContactPicker) must not be overwritten. Pinned by `fieldValues` tests and the skip rule in `restoreForm` (Task 2).
3. **File inputs and passwords** must never be snapshotted. Pinned by a `fieldValues` test (Task 2).
4. **A drawer that saved successfully** closes itself through the redirect and must not ask "verwerfen?". It must still ask after typing into a quick-create drawer (`SaveBar always`). Browser steps in Task 1.
5. **Existing trash confirmations** (bulk bar "In den Papierkorb", `{count}` from ticked ids) must keep working when `data-confirm-count` is absent. Browser step in Task 5.

---

### Task 1: Drawers and dialogs ask before discarding changes (6.1)

**Files:**
- Modify: `src/components/save-bar.tsx` (mark form dirty; export `confirmDiscard`)
- Modify: `src/components/url-sheet.tsx` (`close()`)
- Modify: `src/components/url-dialog.tsx` (`close()`)
- Modify: `src/i18n/messages/de.json`, `en.json` (`common.discardUnsaved`)

**Interfaces:**
- Produces: the `<form>` containing a `<SaveBar>` carries the attribute `data-dirty` while it has unsaved changes, **also when `always` is set**. Task 2 relies on the attribute and on `setDirty`.
- Produces: `export function confirmDiscard(root: ParentNode | null, message: string): boolean` in `save-bar.tsx`. It returns `true` when no `form[data-dirty]` is inside `root` or when the user confirms with `window.confirm(message)`.

- [ ] **Step 1:** In `SaveBar`, add an effect on `dirty` that calls `form()?.toggleAttribute("data-dirty", dirty)`. Leave the existing page-leave guard (`if (!dirty || always) return`) unchanged.
- [ ] **Step 2:** Add `confirmDiscard` (signature above) to `save-bar.tsx`.
- [ ] **Step 3:** In `UrlSheet.close()`, return early unless `confirmDiscard(document.querySelector("[data-slot=sheet-content]"), t("common.discardUnsaved"))`. Do the same in `UrlDialog.close()` with `[data-slot=dialog-content]`. Get `t` from `useT()`. The sheet stays open on "Abbrechen" because `open` is always `true` and only the URL closes it.
- [ ] **Step 4:** Add `common.discardUnsaved`. de: `"Ungespeicherte Änderungen verwerfen?"` / en: `"Discard unsaved changes?"`.
- [ ] **Step 5:** Check in the browser at 375 px and 1280 px on `/settings/fields?new=contacts`:
  - Type a label, then press Esc, click the backdrop and click the X: each time the question appears, and "Abbrechen" keeps the drawer and the text.
  - Without typing, the drawer closes at once.
  - On `?edit=<id>` of an existing field, saving successfully closes the drawer without a question.
- [ ] **Step 6:** `npm run lint && npm run build`, then commit: `git commit -m "Drawers and dialogs ask before discarding unsaved changes"`.

### Task 2: Forms keep their input after a server error (3.1)

**Files:**
- Create: `src/lib/form-snapshot.ts` (pure)
- Create: `src/lib/form-snapshot.test.mjs`
- Modify: `src/components/save-bar.tsx`

**Interfaces:**
- Consumes: the `data-dirty` / `setDirty` behaviour from Task 1.
- Produces (`src/lib/form-snapshot.ts`):
  - `export type Snapshot = Map<string, string[]>`
  - `export function fieldValues(entries: Iterable<[string, unknown]>): Snapshot`. String values only, grouped by name in order; drops `File` values.
  - `export function failedSubmit(search: string): boolean`. True when the query string has `error`.
- Produces (`save-bar.tsx`, not exported): `restoreForm(form: HTMLFormElement, snap: Snapshot): void`.

- [ ] **Step 1: Reproduce.** On `/contacts/new` in a test org, fill only Geburtstag, E-Mail and Ort, then click "Kontakt anlegen". The server rejects it (name or company missing), the error toast shows, and nothing is written. Expected today: all three fields are empty afterwards. Note whether the reload keeps `?error=` in the URL for the first render. If the fields are **not** emptied, stop and report: the finding is wrong and the rest of this task is unnecessary.
- [ ] **Step 2: Write failing tests** in `src/lib/form-snapshot.test.mjs` (import `./form-snapshot.ts`):
  - `fieldValues` groups `[["tags","a"],["tags","b"],["first_name","Erika"]]` → `Map { tags → ["a","b"], first_name → ["Erika"] }`
  - `fieldValues` drops `["doc", new File(["x"], "a.txt")]` → `doc` absent
  - `failedSubmit("?new=contacts&error=Name%20fehlt")` → `true`; `failedSubmit("?ok=Gespeichert")` → `false`; `failedSubmit("")` → `false`
- [ ] **Step 3:** `npm test` → the new tests FAIL (module missing).
- [ ] **Step 4:** Implement `fieldValues` and `failedSubmit` as specified.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** In `SaveBar`:
  - Keep a `useRef<Snapshot | null>`. Fill it on the form's `submit` event: a document capture listener filtered to `form()`, so Enter and the bar's button both count. Build it with `fieldValues(new FormData(form))`, minus names of `input[type=password]`.
  - Read `useSearchParams()` during render.
  - In `Save`'s `onDone` (pending → false): if `failedSubmit(searchParams.toString())` and a snapshot exists, call `restoreForm(form, snap)` and `setDirty(true)`. Always clear the ref afterwards.
- [ ] **Step 7:** Implement `restoreForm`. It loops over `form.elements` in document order and only touches elements whose `name` is in the snapshot:
  - Skip `type` `hidden`, `file`, `password`, `submit` and `button`, so component-owned hidden inputs stay untouched.
  - `checkbox` / `radio`: set `checked = values.includes(el.value)`.
  - `select[multiple]`: select every option whose value is in the list.
  - Anything else: take the next unused value for that name.
- [ ] **Step 8:** Repeat Step 1. Expected: Geburtstag, E-Mail and Ort keep their values, the SaveBar shows "Ungespeicherte Änderungen", and the toast shows the error. Then fill a name and save. Expected: the contact page opens with the entered values. If Step 1 showed `?error=` already gone at that render (Notice strips it in its effect), keep the URL check but move Notice's `history.replaceState` into `setTimeout(…, 0)` and re-check.
- [ ] **Step 9:** Review Focus 1: on the new contact's page, change the Ort and save (`?ok=`). Expected: the saved value shows and nothing is restored.
- [ ] **Step 10:** `npm test && npm run lint && npm run build`, then commit: `git commit -m "SaveBar: forms keep their values after a server-side error"`.

### Task 3: Visible inputs in dark mode (6.2)

**Files:**
- Create: `src/app/theme.test.mjs`
- Modify: `src/app/theme.css` (`.dark` block, `--input`)

**Interfaces:** none (CSS token only).

- [ ] **Step 1: Write the failing test** `theme.test.mjs`:
  - Read `theme.css` and take the `.dark { … }` block.
  - Parse `--name: oklch(L C H)` and assert `C === 0` for the tokens used.
  - Luminance of an achromatic OKLCH grey is `Y = L³`. Contrast is `(max(Y)+0.05)/(min(Y)+0.05)`.
  - Test `dark --input has ≥ 3:1 contrast against --popover, --card and --background`.
- [ ] **Step 2:** `npm test` → FAIL (today `--input` = `--popover` = 0.26 → 1:1).
- [ ] **Step 3:** Set `.dark { --input: oklch(0.55 0 0); }`. That gives 3.2:1 against popover (0.26), 3.7:1 against card (0.20) and 3.9:1 against background (0.18).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Check in dark mode at 375 px and 1280 px:
  - an input and a textarea in `/settings/fields?new=contacts`
  - an input on a card (`/contacts/new`)
  - an outline button, a checkbox and a native select (they also use `--input` for border and `bg-input/30`)
  Take screenshots. If the `bg-input/30` fills look clearly too bright, stop and show the user rather than changing components.
- [ ] **Step 6:** `npm test && npm run build`, then commit: `git commit -m "Dark theme: input borders reach 3:1 against popover, card and background"`.

### Task 4: Real 404 and error pages (7.1)

**Files:**
- Create: `src/app/not-found.tsx` (unmatched URLs on all three surfaces, inside the root layout)
- Create: `src/app/(app)/not-found.tsx` (`notFound()` inside the App, inside the shell)
- Create: `src/app/(app)/error.tsx` (runtime errors inside the shell)
- Create: `src/app/global-error.tsx` (errors in the root layout)
- Create: `src/app/(app)/settings/page.tsx` (redirect)
- Modify: `de.json`, `en.json` (`errors.page.*`)

**Interfaces:**
- Consumes: `EmptyState` from `@/components/page` (`{ icon, title, text, action }`), `APP_HOME`, `getT` / `useT`.
- Produces: i18n keys `errors.page.notFoundTitle`, `errors.page.notFoundText`, `errors.page.home`, `errors.page.errorTitle`, `errors.page.errorText`, `errors.page.retry`, `errors.page.code`.

- [ ] **Step 1:** Add the keys (de / en):
  - `notFoundTitle`: "Seite nicht gefunden" / "Page not found"
  - `notFoundText`: "Diesen Link gibt es nicht oder nicht mehr. Vielleicht ist er unvollständig." / "This link doesn't exist (any more). It may be incomplete."
  - `home`: "Zur Startseite" / "Go to start page"
  - `errorTitle`: "Hier ist etwas schiefgelaufen" / "Something went wrong here"
  - `errorText`: "Deine Daten sind nicht verloren. Versuch es noch einmal oder geh zur Startseite." / "Your data is not lost. Try again or go to the start page."
  - `retry`: "Erneut versuchen" / "Try again"
  - `code`: "Fehlercode: {code}" / "Error code: {code}"
- [ ] **Step 2:** `src/app/not-found.tsx`: a server component with `getT()`, a centred `EmptyState` (icon `FileQuestionIcon`), and an action link to `/`. Use `/` rather than `APP_HOME` because this page also serves public org sites and the landing page; the proxy maps `/` to the right home per host. Export `metadata` with the title. Do **not** add a top-level catch-all route to `(app)` to get the shell: it would also catch `/s/<site>/…` misses and send public visitors to the login.
- [ ] **Step 3:** `src/app/(app)/not-found.tsx`: the same inside `<Page>`, with the action link to `APP_HOME`.
- [ ] **Step 4:** `src/app/(app)/error.tsx` (`"use client"`):
  - `EmptyState` with `AlertTriangleIcon`.
  - Two buttons: `retry()` "Erneut versuchen" (`Button`) and a link to `APP_HOME` (outline).
  - When `error instanceof Error && error.digest`, a muted line `errors.page.code` with the digest.
  - Log nothing else to the UI.
- [ ] **Step 5:** `src/app/global-error.tsx` (`"use client"`):
  - Own `<html lang>` / `<body>`, importing the global stylesheet the root layout imports.
  - Pick `messages.de` or `messages.en` from `@/i18n/config` by `navigator.language` (the I18nProvider is gone here).
  - Show title, text and a retry button. Keep it minimal.
- [ ] **Step 6:** `src/app/(app)/settings/page.tsx`: `redirect("/settings/profile")` (the first `SETTINGS_TABS` entry, the same target as the top-bar button).
- [ ] **Step 7:** Check in the browser (dark and light):
  - `/app/settings` → lands on Profil.
  - `/app/gibtsnicht` → the German 404 with "Zur Startseite", which leads to "Heute".
  - `/app/contacts/00000000-0000-0000-0000-000000000000` → the in-shell 404 with the sidebar, if that page calls `notFound()`. Otherwise note which one shows.
  - To see `error.tsx`, temporarily `throw new Error("test")` in a page in dev, check the retry button and the code line, then remove the throw.
- [ ] **Step 8:** `npm run lint && npm run build` (watch for Cache Components errors about uncached data outside `<Suspense>` in `not-found.tsx`: the root layout's `<Suspense>` should cover it; if not, wrap the body in `<Suspense>`). Then commit: `git commit -m "Own 404 and error pages with a way back; /settings redirects to the profile"`.

### Task 5: Confirm reminders and money status changes on the dues page (11.1)

**Files:**
- Modify: `src/components/confirm-submit.tsx` (`ConfirmHost` variables)
- Modify: `src/app/(app)/members/dues/page.tsx` (lines ~44-48 open-dues query, ~76-79 remind-all, ~171-174 mark collected, ~230-235 bulk bar)
- Modify: `de.json`, `en.json` (`membership.confirm*`)

**Interfaces:**
- Produces: a submit button with `data-confirm="<key>"` may add `data-confirm-count="<n>"` (overrides the ticked-ids count) and `data-confirm-amount="<formatted money>"`. Both title and hint get the variables `{ count, amount }` (`t.dynamic(key, vars)`, `t.dynamic(`${key}Hint`, vars)`).

- [ ] **Step 1:** In `ConfirmHost`, store `vars = { count: Number(button.dataset.confirmCount ?? <ids count>), amount: button.dataset.confirmAmount ?? "" }` in state and pass `vars` to both `t.dynamic` calls.
- [ ] **Step 2:** Add the keys. de first, en analog. `count` drives one/other.
  - `membership.confirmRemindAll`: one "{count} Mitglied an {amount} erinnern?" · other "{count} Mitglieder an insgesamt {amount} erinnern?"
  - `membership.confirmRemindAllHint`: "Jede Person bekommt sofort eine E-Mail mit ihren offenen Beiträgen. Wer keine E-Mail-Adresse hat, wird übersprungen."
  - `membership.confirmBulkRemind`: one "An {count} ausgewählten Beitrag erinnern?" · other "An {count} ausgewählte Beiträge erinnern?"; Hint = same text as `confirmRemindAllHint`
  - `membership.confirmBulkPaid`: one "{count} Beitrag als bezahlt markieren?" · other "{count} Beiträge als bezahlt markieren?"
  - `membership.confirmCollected`: one "{count} Beitrag über {amount} als eingezogen markieren?" · other "{count} Beiträge über {amount} als eingezogen markieren?"
  - `membership.confirmCollectedHint`: "Erst markieren, wenn die Bank die Lastschrift ausgeführt hat. Die Beiträge gelten dann als bezahlt."
- [ ] **Step 3:** In the dues page:
  - Add `membership_id` to the open-dues select and compute `overduePeople` = distinct `membership_id` of open dues with `due_on < now`. One reminder mail goes per person.
  - Remind-all `SubmitButton`: `data-confirm="membership.confirmRemindAll" data-confirm-count={overduePeople} data-confirm-amount={t.money(overdue)}`.
  - "Als eingezogen markieren": `data-confirm="membership.confirmCollected" data-confirm-count={r.count} data-confirm-amount={t.money(r.total_cents)}`.
  - Bulk bar: "Bezahlt" gets `data-confirm="membership.confirmBulkPaid"`, "Erinnern" gets `data-confirm="membership.confirmBulkRemind"`.
- [ ] **Step 4:** Check in the browser on `/members/dues` (test org with ≥ 1 overdue due):
  - Click "Erinnerung an alle Überfälligen". Expected: a dialog naming the number of people and the total. Click "Abbrechen"; no toast "Erinnerungen … verschickt" appears.
  - Tick two dues and click "Bezahlt". Expected: "2 Beiträge als bezahlt markieren?". Cancel.
  - Review Focus 5: on `/contacts`, tick one row and use the bulk bar's trash action. Expected: still "1 Eintrag in den Papierkorb legen?". Cancel.
- [ ] **Step 5:** `npm run lint && npm run build`, then commit: `git commit -m "Dues: confirm reminders, bulk paid and SEPA collected with count and amount"`.

### Task 6: Final check

- [ ] **Step 1:** `npm test && npm run lint && npm run build`. All pass.
- [ ] **Step 2:** Report to the user with the branch name and one screenshot per task. Don't push or merge without their go.
