<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Roots — Agent Rules

## Stack
- Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind v4
- shadcn/ui (Base UI primitives) in `src/components/ui/` — add via `npx shadcn@latest add <name>`, don't hand-write primitives
- Supabase: Postgres, Auth, Storage, RLS. Clients in `src/lib/supabase/{server,client}.ts`
- Supabase MCP configured in `.mcp.json` — use it for schema inspection, migrations, logs, advisors
- Architecture + roadmap: `docs/plans/plan-v1.md` is the current plan — read it before adding a module or table. Other files in `docs/plans/` are drafts for comparison, not binding

## Backend lives in Next.js
- **Reads**: Server Components call `createClient()` from `@/lib/supabase/server` directly. No API layer in between.
- **Mutations**: Server Actions (`"use server"`), colocated as `actions.ts` next to the route.
- **Route Handlers** (`app/api/**/route.ts`) only for webhooks, cron, or anything called by a third party.
- **Authorization = RLS.** Every table has RLS enabled with explicit policies. Never rely on app code alone.
- Secret key (`SUPABASE_SECRET_KEY`) only in server code, only when RLS must be bypassed (webhooks/admin jobs). Never `NEXT_PUBLIC_`.
- Verify the user with `supabase.auth.getClaims()` / `getUser()`, never trust `getSession()` on the server.
- Validate all input at Server Action / Route Handler boundaries.

## Database
- Schema changes = new file `supabase/migrations/<yyyymmddhhmmss>_<name>.sql`, then `npm run db:push` (CLI over the session pooler in `DATABASE_URL`). Never edit an applied migration; add a new one. No ad-hoc DDL.
  Don't use MCP `apply_migration` for schema: its versions drift from the files and it rejects some statements.
- After every schema change: `npm run db:types` (regenerates `src/lib/supabase/types.ts`), `npm run db:test` (tenant isolation, must print "all checks passed"), MCP `get_advisors` (security + performance).
- Every org-scoped table:
  - `org_id uuid not null references public.orgs on delete cascade`
  - audit columns `created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid` + `select public.enable_audit('public.<table>')`
  - RLS on, policies via `public.is_member / has_perm(org_id, '<module>.<action>') / module_enabled(org_id, '<module>')`, `revoke all ... from anon`
  - a few assertions added to `supabase/tests/isolation.sql`
- Secrets only via `save_integration` / `get_integration_secret` (Vault). Never store secrets in normal columns.

## App patterns
- `getContext()` / `requirePerm(perm)` (`src/lib/context.ts`): signed-in user, active org, role, enabled modules, `can(perm)`.
  `ctx.supabase` sends `x-org-id` → the database only shows the active org (`public.request_org()` inside `is_member/has_perm`). Still filter by `org_id` in queries; the header is the safety net. Cross-org queries (org switcher, `/admin`) use the unscoped session client.
- Server Actions report back through the URL: `back(path, { error | ok })` + `<Notice>`, which shows it as a toast (sonner, `<Toaster>` in the root layout) and strips the params. No inline success/error boxes; for client code call `toast()` from `sonner`. Forms that must keep their state use `useActionState`.
- CRUD screens: `<DataTable>` (+ `<SearchBox>` `?q=`, `<Pager>` `?page=`) from `@/components/data-table`. **Drawer or page:** a record with real content (related lists, notes, files, a preview – more than a short form) gets its own page `/<area>/<id>` with `<PageCrumbs>` (`src/components/page-crumbs.tsx`, e.g. Kontakte › Erika Muster) and `#anchor` sections; small records (settings-like rows, a few fields) open in a drawer: row links to `?edit=<id>`, which renders `<UrlSheet params={["edit"]}>` with the edit form. When a drawer record becomes a page, redirect its old `?edit=<id>` links. "New" = `?new=<thing>` + `<UrlSheet>`. Build links with `withParams(sp, {...})` to keep other params. `<UrlDialog>` only for confirmations.
- Plain shadcn styling for now; the design system comes later.
- Forms in drawers pass the record id as a hidden `id` field (not `action.bind(null, id)`), so every action is a plain form post (no JS needed, callable from tests).
- Times: store `timestamptz`; `<input type="datetime-local">` values go through `fromLocalInput` / `toLocalInput` (`src/lib/time.ts`, Europe/Berlin); `t.date()` formats in that zone.
- Images (profile pictures, logos, event images): public `images` bucket, paths `users/<id>/…` or `orgs/<org>/…` (`orgs/<org>/events/…` for events.manage), write rules in `can_write_image()`. Store the path in a `*_path` column, upload with `replaceImage()`, show with `<Picture>` / `imageUrl()`, form `<ImageForm>`.
- **Files** (documents, scans, attachments; core, permissions `org.files.view/manage`): private bucket `files`, rows in `public.files` (`entity` + `entity_id` attach a file to any record, `folder` for loose files, `meta jsonb`). The browser uploads straight to Storage (`<FileUpload>`, compresses photos to WebP ≤ 2000 px), then `registerFiles()` stores the row. Show a record's files with `<FileList ctx entity entityId back>`; open/download via `/files/<id>` (short signed URL). Public images (logos, event pictures) stay in the `images` bucket.
- **Letters** (Dateien → Vorlagen, core, `org.files.*`): `letter_templates` = name, heading, rich-text body with `{placeholders}`, own `fields` ([{ key, label, type: text|date|textarea }]) and a `letterhead` switch (logo, sender line, footer from the invoice settings). `org_id null` = roots defaults (migrations only, read-only for orgs; "Kopieren & anpassen" makes an own copy). Filling/escaping/fields in `src/letters/model.ts` (pure, tested), contact + membership values and the server-side rebuild in `src/letters/server.ts`. The composer previews live with `<DocumentPage>` inside `<PaperPreview>` (sandboxed iframe); download posts to `/files/templates/<id>/pdf`, "ablegen" stores the PDF in `files` on the contact, "senden" mails it as an attachment. The PDF renderer draws rich text via `htmlBlocks()` (`src/documents/rich.ts`). New placeholder = add it to `PLACEHOLDERS` + `contactVars()`.
- **Members** (module `members`, requires `crm`): a person is a contact; a membership is a period on it (`starts_on`/`ends_on`, active = computed). Member numbers + mandate refs come from a DB trigger (rejoining keeps the number). Dues (`member_dues`) are money: never deleted, status open/paid/cancelled. Period logic + notice dates in `src/members/dues.ts`, SEPA XML (pain.008.001.08) in `src/members/sepa.ts` (both pure, tested). roots moves no money: the treasurer uploads the SEPA file to online banking, then marks the run collected.
- **Forms** (module `forms`): a form is an ordered `elements` jsonb list (platform fields incl. custom fields, text, consent, SEPA mandate), validated by `readSubmission()` in `src/forms/elements.ts` (pure, tested). The `purpose` decides what a submission does (`contact` → contact created/updated at once; `membership` → board accepts in Forms → Einsendungen). Public at `/f/<slug>` via the definer RPC `public_form()` (returns only what rendering needs); submissions are stored by the public server action with the service role after validation. New purpose = add it to `PURPOSES`, the DB check, a template and the accept logic.
- **Custom fields** (org-defined extra fields, any entity): definitions in `custom_fields` (org, entity, key, label, type, options, required; managed at Settings → Felder by `org.settings.manage`), values in the entity's `custom jsonb` column as `{ key: value }`. Never one column per field, never EAV rows. Validate with `readCustom()` / `parseValue()` from `src/lib/custom-fields.ts` in every entry path (form, import, API); form inputs via `<CustomFieldInputs>` (names `custom.<key>`). New entity: add it to the `custom_fields.entity` check, add `custom jsonb not null default '{}'`, add it to `CUSTOM_ENTITIES`.
- **CSV import** (any entity): `<CsvImport>` (`src/components/csv-import.tsx`) parses in the browser (`src/lib/csv.ts`: `;`/`,`/tab, quotes, UTF-8/Windows-1252), guesses the column mapping from headers + aliases, previews row errors with the module's own validator, then calls the module's server action, which validates every row again and inserts in one statement. Bulk inserts emit one `<module>.imported` event (statement trigger), not one per row. Keep each module's field parsing in a pure `fields.ts` (relative `.ts` imports) so the form, import, API and `node --test` share it.
- **Export** (any list): add an exporter to `src/app/(app)/export/[entity]/exporters.ts` (permission, module, loader that applies the list's filters) and put `<ExportMenu entity query>` next to the list's buttons. `/export/<entity>?format=csv|xlsx` writes CSV (`;` + BOM for German Excel) or real .xlsx (`src/lib/export.ts`, no dependency). Use the import's field labels as headers so exports can be re-imported.
- **Email** (provider-agnostic): org emails go through `sendOrgEmail()` (`src/lib/org-email.ts`), which uses the org's connected integration with an `email.send()` (Resend today; a new provider = one integration file) or roots' fallback; platform mails use `sendPlatformEmail()`. The `email` module adds campaigns (audience = tags and/or active members), automations (hub event type + delay → email to the payload's `contact_id`/`email`, queued by a DB trigger on `hub_events`; register reactable events in `src/email/events.ts`) and one queue `email_sends` that the minute worker sends (`processEmailQueue()`). Bodies are `rich` (editor, default) or `html` (pasted); `<EmailBodyField>` switches between them (old `text` bodies open in the editor), HTML preview in a sandboxed iframe), rendered by `renderMail()` (`src/email/render.ts`: escaped placeholders, inlined styles, scripts stripped, text version). Every campaign/automation mail has an unsubscribe link (`/u/<send id>`, one-click `/api/unsubscribe/<id>`); `contacts.unsubscribed_at` is respected everywhere. Delivery feedback: campaign/automation mails carry a `send_id` tag; the provider webhook (`/api/webhooks/resend`, Svix-signed) calls `recordDelivery()` → `email_sends.delivery` (delivered/delayed/bounced/complained, never downgraded); hard bounces and spam complaints unsubscribe the contact. Transactional mails aren't tracked.
- **Customer portal** (`/s/<org>/portal`, public surface): contacts sign in with a magic link (`src/portal/session.ts`: one-time login token → 30-day session cookie per org, hashed in `portal_tokens`, service role only; the link page needs a button click so mail scanners can't use it up; the request form answers the same for unknown emails). Modules add a section to `PORTAL_SECTIONS` (`src/portal/sections.ts`): a server component that only reads/writes rows of the signed-in `contact.id` in that org. Members is the first (membership, dues, own data, new SEPA mandate, cancel).
- **Printed documents** (quotes, invoices, later receipts/letters): build a neutral `DocView` (`src/documents/model.ts`) and render it with a template from `src/documents/templates.tsx` (shared letterhead, DIN 5008 address window, items, totals, footer; inline paper styles). Output: `/print/documents/[id]` (HTML templates, browser print) and `/print/documents/[id]/pdf` (server PDF from the same model via `src/documents/pdf.ts`, pdf-lib, DIN 5008; use it for email attachments). Money documents: number only on issue (`issue_document()`, gap-free per `number_ranges`), then frozen (DB trigger); corrections by cancelling, never by editing or deleting.
- Roles are global (`roles.org_id is null`), defined by platform admins at `/admin/roles`, names stored as `{"de","en"}` (show with `t.pick(name)`). Orgs only assign roles; the org Roles tab is read-only. `org_id` on roles stays for possible org-specific roles later.
- Platform admins (superadmins, `platform_admins` table) pass every org check in the DB (`is_member/is_owner/has_perm` → true) and get `/admin` (orgs + users). `getContext().viaPlatform` = admin is inside an org they're not a member of. Grant the first one with `npm run admin:grant -- <email>`.
- Payments (`src/payments/`): modules sell via `createOrder` → `startCheckout`; register fulfilment in `src/payments/fulfilment.ts` (idempotent `onPaid`/`onRefunded`). Never fulfil because the buyer's browser says so: the provider webhook drives `markPaid`, and `reconcileOrder()` (ticket page while pending) asks the provider directly as a backup. Providers implement `src/payments/provider.ts` (Stripe: Accounts v2 / OAuth = direct charges on the connected account with application fee, or the org's own key = plain charges without fee; always go through `stripeFor(orgId)`; Checkout Sessions). Amounts are integer cents; show with `t.money()`.
- Event hub (`src/events/`): things that happen → `hub_events` (DB triggers or `emit_event()` with the service role) → deliveries per subscription (Settings → Integrations → Notifications section). New event types: add to `src/events/registry.ts` + `events.types/messages.<key>` texts (payload keys become placeholders; `starts_at` → `{when}`). After an action that emits, call `deliverSoon()`. (`public.events` is the Events module's table, not the hub.) The worker is `/api/cron/events` (every minute via Supabase pg_cron: `npm run worker:schedule -- <app-url>` once per deployment; Vercel's daily cron is only a fallback because Hobby allows no more; `npm run worker` locally); any other worker can use `claim_event_deliveries()` / `finish_event_delivery()`.
- Modules are switched on per org by platform admins only (`/admin/orgs` drawer); the org Modules tab is read-only. For now every org gets every module (existing + new orgs, `public.default_module_keys()` + trigger on `orgs`); a new module key goes into that function in a new migration (unit test `src/modules/registry.test.mjs` checks it matches the registry).
- Modules: `src/modules/registry.ts` (key, requires, permissions, nav). Integrations: one file per provider in `src/integrations/`.
- Speed: the database is ~70 ms away, so every sequential query costs that much. Run independent queries with `Promise.all`, embed related rows in one select (`orgs(…, org_modules(…))`) instead of follow-up queries, and keep the request path at ≤ 2 rounds (context, then layout ∥ page). Every area has a `loading.tsx` skeleton so clicks react instantly.
- Cache Components is on: the root layout has one `<Suspense>`, request-time pages export `instant = false`, and `getSession()` calls `connection()`. Read the session before creating other Supabase clients. Public pages should later get real static shells.

## Design system
- Theme tokens live in `src/app/theme.css` (`:root` + `.dark`, oklch, radius, shadows). Switching themes = replace that file with a tweakcn/shadcn export. Change the look there, not per-component.
- Use semantic classes only: `bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`… **No raw colors** (`bg-blue-500`, hex) in components.
- Radius via `rounded-md/lg/xl` (derived from `--radius`). Spacing on Tailwind scale.
- Compose from `src/components/ui/*`; app-level components go in `src/components/`. Use `cn()` from `@/lib/utils` for class merging.
- Icons: `lucide-react` only.
- Accessible basics: labels on inputs, focus rings intact, real `<button>`/`<a>`.

### One style guide, every device
Every screen works on phone (from 360px), tablet (iPad, `md` = 768px+) and desktop, in light + dark. Same components, same tokens; only the arrangement changes.
- Mobile-first classes: base = phone, add `sm:` / `md:` / `lg:` for wider. No fixed widths that can overflow; text truncates or wraps.
- Signed-in areas use `<AppShell>` (`src/components/app-shell.tsx`, App + `/admin`): shadcn sidebar = drawer on phones, collapsible to icons (with tooltips) from `md`. Nav items need a lucide icon (`icon` in the module registry).
- Calendars: `<CalendarView>` (`src/components/calendar-view.tsx`, wraps the vendored ReUI event calendar in `src/components/reui/`): month / week / day / list / per-person views, view + date in the URL, click → `href` (drawer), empty slot click (`newMinutes` long) or drag across a range → `newHref` with `start`/`end`, optional drag via a server action. Use it for anything with dates (shifts, events, bookings) instead of building grids.
- No fixed row limits in the UI: lists paginate on the server (`<Pager>`), pickers search on the server (`<ContactPicker>` + a `search*` server action, 20 results per query). Never load "all" rows into a select.
- Rich text anywhere: `<RichTextEditor name defaultValue placeholders?>` (`src/components/rich-text-editor.tsx`, Tiptap) posts HTML like a normal input. Never render stored HTML in the app outside a sandboxed iframe.
- Tags: pick them with `<TagSelect name options defaultValue creatable?>` (chips, not typing); the org's tags come from `rpc("contact_tags")`.
- Lists: `<DataTable>` shows cards on phones (first column = title, others label/value) and a table from `md`. Keep the first column meaningful.
- Drawers (`<UrlSheet>`) are full-width on phones. Forms stack on phones: `grid gap-4 sm:grid-cols-2`.
- Toolbars and page headers wrap: `flex flex-wrap items-center gap-3`.
- Pages are left-aligned (same left margin everywhere): `grid max-w-5xl gap-6`, never `mx-auto` in the App/admin. Popovers from the sidebar open below/above their trigger, as wide as the sidebar.
- Feedback on every action: form buttons are `<SubmitButton>` (`src/components/submit-button.tsx`: spinner + disabled while the server action runs), navigation shows the area's `loading.tsx` skeleton, client-side work (`useTransition`) disables its trigger and shows a pending label. Never a plain `<Button type="submit">`.
- Icon-only buttons get a `<Tooltip>` and an `aria-label`. Touch targets at least `size-8`.
- Check new screens at 375px, 768px and 1280px before committing.

## Data lifecycle rules (every new table / feature)
**Audit (always):** every org-scoped table gets the audit columns + `enable_audit()`. The change log is the history; never write audit data by hand, never put secrets in audited columns. Only platform admins read it (`/admin/activity`); add new tables' labels under `activity.tables`.

**Events (when something meaningful happens):** if an org would want to be told about it (sale, sign-up, booking, cancellation…), emit a named event (`<module>.<thing>`, past tense: `ticket.sold`, `contact.created`) via a DB trigger or `emit_event()`, register it in `src/events/registry.ts` with `events.types/messages` texts, and call `deliverSoon()` after the action. Events are facts; never rely on them for the change itself.

**Who gets told what (three separate streams):**
1. *roots → people on the platform*: personal notifications (in-app inbox, email, later push). Give the event type an `audience` (permission or `platform: true`) and default channels in `src/events/registry.ts`; the router (`src/events/router.ts`) finds the people, applies their preferences (Settings → Profile) and skips whoever caused the event. New channel = one sender in `src/events/channels/` + add to `personChannels`.
2. *Org → its own tools*: webhooks / Telegram etc. (Settings → Integrations), fanned out by `emit_event()` to `event_subscriptions`.
3. *Org → its customers* (ticket buyers, guests): transactional messages sent by the module itself in the org's name (org's email integration, roots fallback). Not preference-driven, not through the router.

**Deleting, by kind of data:**
| Kind | Rule |
|---|---|
| Business objects people manage (contacts, events, tickets, pages, … and orgs) | **Soft delete**: `deleted_at`, hidden by RLS, restorable from a trash view, purged after 30 days |
| Links and technical rows (members, invites, subscriptions, deliveries, settings) | Hard delete; the change log keeps a copy |
| Money (orders, payments, refunds, invoices) | **Never deleted**: change status instead (cancelled, refunded) |
| User accounts / personal data on request | Hard delete (GDPR); anonymise references where history must stay |

How: `select public.enable_soft_delete('public.<table>', 'org_id', '<module>.manage', 30)` in the migration. Delete/restore only via `rpc("soft_delete" | "restore_deleted", { p_table, p_id })` (permission checked in the DB); the cron purges. Trash views filter `.not("deleted_at", "is", null)`, normal lists `.is("deleted_at", null)` (RLS already hides deleted rows from people who can't see the trash).

Soft-delete side effects to handle every time:
- Unique values only count among live rows: partial unique indexes `… where deleted_at is null` (re-creating something with the same email/name must work).
- Exception: identifiers others rely on (an org's address/subdomain) stay reserved until the row is purged, so restoring can't collide.
- Normal queries never see deleted rows (RLS), only trash views and restore actions do.
- Deleting a parent soft-deletes nothing implicitly: decide per relation (usually children stay and disappear with the parent's visibility).

## Translations (German first)
- No hardcoded UI text. Every string lives in `src/i18n/messages/de.json` (source of truth) and `en.json`. The build fails if `en.json` is missing a key.
- Server: `const t = await getT()` (`@/i18n/server`). Client: `const t = useT()` (`@/i18n/client`). `t("members.invite")`, `t("roles.memberCount", { count })` (plural groups `one`/`other`), `t.list([...])`, `t.date(value)`.
- Keys built at runtime (module/permission names): `t.dynamic(`modules.${key}.name`)`.
- Module texts: `modules.<key>.name/description`, permission labels: `permissions.<perm>`, integration texts: `integrations.<key>.*`.
- Database functions raise short codes (`raise exception 'last_owner'`) → add `errors.<code>` to both files; show them with `dbError(t, error)`. Supabase auth errors: `authError(t, error)`.
- Language = `locale` cookie → browser language → German. Public pages will later use the org's language.
- Adding a language: add a JSON file and the code to `locales` in `src/i18n/config.ts`.
- `npm test` runs `*.test.mjs` files (node --test).

## Three surfaces
- **Website** (`src/app/site/`, the bare domain's `/`): marketing landing page with its own look — design sheet `docs/design/site.md`, styles scoped to `.site` in `site.css`, own fonts, texts under `landing.*`. Product shots are CSS device mocks (`_components/devices.tsx`, `mocks.tsx`), never screenshots. Building blocks live in `_components/ui.tsx`; every new one goes onto `/style/site` too. `/style` (English, not indexed) is the internal reference for both looks: `/style/app` and `/style/site`.
- **App** (`src/app/(app)/`, `app.<domain>` at the root, or `/app/…` on the bare domain): logged-in back office. Everything through RLS + permissions. Routes are written without `/app`; `src/proxy.ts` strips the prefix (rewrite) and moves unprefixed App paths on the bare domain under `/app`. Link to the App's home with `APP_HOME`, compare paths with `appRoute()` (`src/lib/url.ts`).
- **Public** (`src/app/s/[site]/`, `<org>.roots.app` + custom domains): outward-facing pages for anyone. Never expose unpublished data; public writes only via Server Actions that validate input + link tokens. Never import App-only code (admin queries, secret-key clients) into Public pages without a reason.
  - Reads use `createPublicClient()` (always anonymous, even for signed-in visitors) + `getSite(slug)`. What anon may see is decided in the DB: an `anon` select policy (e.g. `status = 'published'`, module on via a small definer helper like `events_public()`) plus **column grants** (`grant select (<public columns>) … to anon`, never audit columns).
  - Links on public pages are relative to the subdomain (`/e/<slug>`); from the App link with `siteUrl(org.slug, path)`.

## URLs = state (deep-linkable everything)
Every view a user can reach must be shareable/bookmarkable and survive reload + back button.
- **Pages / sub-pages** → path segments: `/events/[eventId]/tickets` (no org in App URLs — active org is a cookie)
- **Tabs** → path segment if the tab is a real sub-page, else `?tab=lineup`. Tabs are `<Link>`s, not local state.
- **Filters, search, sort, pagination, view mode** → search params: `?q=max&status=paid&sort=-created_at&page=2`
- **Dialogs / sheets / drawers on a record** → search param: `?edit=<id>`, `?new=ticket-type`. Closing removes it.
- **Sections on long pages / settings** → `#anchor` ids on headings.
- Read params in Server Components via the `searchParams` prop; update from client with `router.replace` (filters) or `<Link>` (navigation). No `useState` for anything that should be in the URL.
- Keep params short, lowercase, stable — they are public API once shared.

## Deployment
- Vercel project `roots` (team daniel-ladwigs-projects), Git-connected: every push to `main` deploys production (https://roots-berlin.vercel.app). Functions run in `lhr1` (vercel.json) next to the Supabase database (eu-west-2); keep them together.
- Env vars live in Vercel (Production + Preview); `NEXT_PUBLIC_*` are baked in at build time, so redeploy after changing them.
- The worker runs every minute via Supabase pg_cron (`npm run worker:schedule -- <prod-url>`; `CRON_SECRET` must match Vercel's). Vercel's own cron (daily, Hobby limit) is only a fallback.
- Org subdomains (`<org>.<root>`) need a real domain with a wildcard; on `*.vercel.app` only the App works.

## Conventions
- Prefer the simplest working thing: no abstractions, wrappers, or libraries until there's a second real use.
- Server Components by default; `"use client"` only for interactivity.
- `npm run lint` and `npm run build` must pass before committing.
- No AI attribution in commits or PRs (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
