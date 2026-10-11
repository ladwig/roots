# Roots — Plan (v2 draft)

> **Status: outdated draft, not binding.** Written against an older state of `main` (`2a250be`, before payments, ticketing, guest lists, invoices, shifts, event hub and soft delete). Many points are already built or decided differently; it needs a rework against `plan-v1.md` and the current code before it can replace it.

Modular SaaS for small organisations (German Vereine, small businesses, event promoters).
Each org turns on the modules it needs. Every module works alone, and modules link up when they're used together.
The UI stays simple even when the system behind it isn't.

## Principles
- **Foundation first.** Tenancy, permissions, audit and modules are built before any feature module.
- **One database, one app.** Modules are folders plus table prefixes, not separate services.
- **RLS is the security boundary, on both surfaces.** The UI hides what you can't use, and the database refuses it. Public writes go through narrow DB functions, not through a secret-key client in app code.
- **Side effects leave the request.** Emails, PDFs and calls to third parties go through the job queue, so retries never send anything twice.
- **Idempotent by schema.** Anything that can be retried (webhooks, jobs, checkout) is protected by a unique constraint, not just by app logic.
- **Privacy by default.** Personal data has a retention rule and can be erased, including from the audit log.
- **Dependencies only go one way.** Ticketing may use Payments and Contacts; Payments knows nothing about events.
- `sidequest` is **inspiration only**: borrow product ideas, not code or schema.

---

## Architecture

### Tenancy
- `orgs` (id, slug, name, settings): the slug becomes the subdomain, e.g. `clubname.roots.app`.
  - Reserved slugs are refused by the DB check: `app`, `www`, `api`, `admin`, `mail`, `status`, `docs`, `help`, `static`.
  - Changing a slug breaks shared links, so old slugs go into `org_slug_history` and the proxy redirects them. Until that table exists, the slug can't be changed.
- `org_members` (org_id, user_id, role_id). A user can belong to many orgs, and there's an org switcher in the app.
- Every business table has an `org_id`, and every RLS policy is scoped to it.

### Roles & permissions (simple but flexible)
- **Permissions** are strings that each module declares: `events.view`, `events.manage`, `tickets.scan`, `crm.view`, `payments.refund`, `org.members.manage` and so on.
- **Roles** are named sets of permissions, stored per org. They're seeded with *Owner*, *Admin*, *Member* and *Door staff*, and orgs can create custom roles by ticking checkboxes.
  Saving a role validates every string against the module registry, so typos and removed permissions don't linger.
- One SQL helper, `has_perm(org_id, 'events.manage')`, is used by RLS policies, Server Actions and the page/nav guards.
- **RLS on big tables** (`evt_*`, `pay_*`, `crm_*`): a per-row `has_perm()` + `module_enabled()` call is slow on lists with thousands of rows. Those policies use a set-returning helper that Postgres evaluates once per query:
  `using (org_id in (select public.my_orgs('events.view', 'events')))`.
  Small core tables keep the simple per-row form.
- There are no per-record ACLs. Add them only when a real case needs one.

### Invites
- `invites` (org_id, email, role_id, token_hash, expires_at, accepted_at, invited_by).
- The email link opens an accept page, which signs the person in or up and creates the `org_members` row.
- Tokens are stored hashed and are single-use.

### Audit (everything, with limits)
- Every table has `created_at`, `created_by`, `updated_at` and `updated_by`, filled by one shared trigger (`auth.uid()`). App code never sets them.
- `audit_log` (org_id, table, row_id, action, actor_id, at, old, new as jsonb diff) is written by one generic trigger attached to business tables.
- One "Activity" view per record and per org can read it.
- **Not every table:** high-churn tables (ticket holds, inventory counters, scan events) skip the change log. `enable_audit(table, log => false)` keeps the audit columns but leaves out the `log_change` trigger.
- **Retention:** entries older than the retention period (default 24 months, see open questions) are deleted by a scheduled job.
- **Erasure:** `erase_contact(id)` anonymises the contact *and* redacts personal fields in the matching `audit_log` rows. The fact that a change happened is kept; the personal values are not.

### Modules
- Definitions live in `src/modules/registry.ts` (key, `requires`, permissions, nav entries); a module moves to `src/modules/<key>/` once it has its own code.
- The DB table `org_modules` (org_id, module_key, enabled_at) records what's on.
- Turning a module on checks `requires`. Ticketing, for example, says "needs Payments → enable it too?"
- Turning a module off checks the reverse: Payments can't be turned off while Ticketing is on.
- RLS checks `module_enabled(org_id, 'events')`, so a module that's off is really off for members.
  Work that's already in flight is still finished: a paid order still gets its tickets even if Ticketing was switched off a minute later.
- Tables are prefixed by module (`evt_*`, `pay_*`, `crm_*`, `shift_*`), with core tables unprefixed.

### Background jobs & outbox (core)
One mechanism for anything that shouldn't run inside a request: emails, ticket PDFs, webhook follow-ups, OAuth token refresh, reminders, retention cleanup.

- `jobs` (id, org_id, kind, payload jsonb, dedupe_key **unique**, run_at, attempts, locked_at, done_at, last_error). Server-only, no RLS access for users.
- Code that triggers a side effect inserts a job **in the same transaction** as the business change (outbox). If the transaction rolls back, no email goes out.
- A worker endpoint (`/api/cron/jobs`, called on a schedule) claims jobs with `for update skip locked`, runs the handler for that `kind` and marks it done. Failed jobs get retried with backoff, up to a max number of attempts.
- `dedupe_key` (e.g. `ticket-email:<order_id>`) makes enqueueing idempotent.
- Handlers live next to their module: `src/modules/<key>/jobs.ts`.

### Integrations & credentials (core)
One generic setup that any provider plugs into (Stripe, Resend, Google Sheets, Mailchimp, DATEV, webhooks, …).

- **Two kinds of credentials**
  - *Platform* (roots' own: Stripe platform key, Resend, etc.) → env vars, never in DB.
  - *Per org* (an org's connected accounts / API keys) → DB, encrypted.
- **Secrets in Supabase Vault** (`vault.secrets`, encrypted at rest). Business tables only hold a `secret_id`, never the secret.
  Secrets are readable only via a `security definer` function callable with the server secret key — never through RLS/PostgREST, never sent to the browser.
- **`org_integrations`** (org_id, provider, status `connected|error|revoked`, `config` jsonb for non-secret settings like account id/scopes, `secret_id`, `expires_at`, last_error, + audit columns).
  One row per org per provider (or per connected account if a provider allows several).
- **Provider registry in code** — `src/integrations/<provider>/integration.ts` manifest:
  key, name, auth type (`oauth2 | api_key | none`), fields to ask for, scopes, and handlers `connect / disconnect / refresh / test / handleWebhook`.
  Adding a provider = adding one folder; the settings UI (`/settings/integrations?connect=stripe`) renders from the manifests.
- **One OAuth flow** for all oauth2 providers: `/api/integrations/[provider]/callback`, signed `state` (org + user + nonce).
  Token refresh runs as a job and locks the `org_integrations` row (`for update`), so two parallel refreshes can't invalidate each other's rotated refresh token.
- **One webhook entry**: `/api/webhooks/[provider]` → verify signature → insert into `integration_events` (provider, external_id **unique**, payload, processed_at, error) → **claim** → process → answer.
  - *Claim*: `update … set locked_at = now() where id = $1 and processed_at is null and (locked_at is null or locked_at < now() - interval '5 minutes') returning id`. If nothing comes back, another delivery is already handling it, so we answer 200 and stop.
  - *Fast*: the handler only does the DB work that has to happen now (order paid, tickets created) in one transaction and enqueues jobs for the rest (PDF, email). Providers time out after a few seconds.
  - *Idempotent fulfilment*: tickets, refunds etc. have unique constraints (e.g. `unique (order_item_id, seq)`), so even a handler that runs twice can't create duplicates.
  - Unprocessed events are picked up again by the job worker, which gives retries and replay for free.
- **Modules declare what they need**: `requires: { modules: ["payments"], integrations: ["stripe"] }` → enabling Ticketing prompts "connect Stripe".
- Using a credential is audited (who connected/rotated/removed what); secret values never appear in `audit_log`.

### Two surfaces: App vs Public
One Next.js codebase, split by host in `proxy.ts` and by route groups:

| | **App** (back office) | **Public** (outward-facing) |
|---|---|---|
| Who | Org members (logged in) | Anyone: ticket buyers, guests, artists, visitors |
| Host | `app.roots.app` | `<org>.roots.app`, later custom domains (`tickets.myclub.de`) |
| Code | `src/app/(app)/…` | `src/app/(public)/[site]/…` (proxy rewrites host → `[site]`) |
| Auth | Supabase session + permissions | None, or scoped link tokens (guestlist link, ticket access) |
| Data | Through RLS as the member | Reads and writes only through `public_*` DB functions (see below) |
| Look | roots design system | Org branding (logo, colors, font) on top of the same components |

Public content is examples like: event pages, ticket shop, checkout, ticket download, guestlist self-service, artist forms, shift signup, a simple org website.
Modules contribute to both: e.g. Events = event management in the App + event page / ticket shop on Public.

**Public data access**
- Every public read and write is a `security definer` function named `public_*`, with `grant execute … to anon`, one per use case: `public_event(site, slug)`, `public_create_hold(event_id, tier_id, qty, session)`, `public_add_guest(token, name, email)`, ….
  Each one checks `published`, token, revocation and quota itself, and returns only the fields the page needs.
- No base-table grants to `anon`. If a view is easier than a function, it must be `security_invoker = true` (plain views bypass RLS).
- Public Server Actions validate input and call these functions with the publishable key. The secret-key client stays out of Public code.

**Abuse protection**
- Checkout and guest forms use a captcha (Cloudflare Turnstile) and rate limits per IP and per link token.
- Holds are capped per session and per IP, so a script can't reserve the whole stock.

**Caching**
- Public pages are static shells tagged with `cacheTag('org:<id>')` / `cacheTag('event:<id>')` and revalidated on publish.
- Live parts (ticket availability, guest list quota) are small dynamic islands inside the shell.

### URLs
- **App**: `app.roots.app/<module>/<id>/<tab>` — e.g. `/events/8f2c…/tickets?tier=early`. **No org in the path.**
  - Active org = cookie (`active_org`), falls back to the user's last used org; switching org is a menu action.
  - Record ids are UUIDs, so a shared link to a record in another of your orgs resolves the record's org and switches automatically; no access → 404.
- **Public**: `<org>.roots.app/<page>` — e.g. `/events/summer-rave`, `/g/<token>` (guestlist link). Slugs, not ids, for anything SEO/shareable.
- All UI state (tabs, filters, sort, page, open dialog, section anchor) lives in the URL — rules in `AGENTS.md`.

### Cross-module glue
- **Contacts are core, and CRM is a module on top.** Ticket buyers, guests, members and customers are all `contacts`. Contacts need no module switch; CRM adds tags, notes, segments and timeline UI.
  - One contact per email per org (`unique (org_id, lower(email))` where email is set). Public flows upsert by email instead of creating duplicates.
  - Consent is stored per contact and purpose (`contact_consents`: purpose, granted_at, source, revoked_at). Buying a ticket doesn't sign you up for the newsletter.
- **Payments are generic.** `pay_orders` and `pay_order_items` reference what was bought with `(source_module, source_id)`. Ticketing creates orders, and later Memberships or Invoices create orders too.

### Privacy (DSGVO)
- Data lives in an EU Supabase region and an EU Vercel function region.
- Every table with personal data has an owner module and a retention rule written down next to its migration.
- Erasure requests go through one function per entity (`erase_contact`, later `erase_member`), which also covers the audit log (see Audit).
- Export of a person's data (Art. 15) is a CSV built from contacts, orders and tickets for that email.
- Offline scanner devices store only hashed ticket codes, never names or emails.

### Environments
- Local → preview (Vercel preview + Supabase branch) → production.
- Each environment has its own Stripe mode (test/live) and its own webhook endpoints and secrets. Production keys never leave production.

---

## Modules

### Payments
- **Stripe Connect.** Each org connects or onboards its own Stripe account; roots takes an `application_fee`. Choose the account type early (see open questions).
  With Standard accounts the org is the seller of record, and receipts are issued in its name.
- **Money model from day one** — every `pay_order_items` row stores:
  - `amount_cents` (integer, gross), `currency`
  - `tax_rate` (e.g. 7 % for many event tickets, 19 % for merch/food) and `tax_cents` as a snapshot
  - the seller (org) and a snapshot of the item name
  so invoices later don't need a migration of old orders.
- Orders, payments and refunds. Tickets and other fulfilment are created **only from the webhook**, inside one transaction, protected by unique constraints (see Integrations).
- Fee pass-through: optionally gross the price up so the buyer pays the fee.
- Later: invoices (German-compliant, gapless numbering via a per-org counter row locked with `for update`, not a Postgres sequence; PDF), SEPA, payouts overview.

### Contacts / CRM
- Contacts (core): dedupe by email, consent per purpose, erasure, CSV import/export.
- CRM (module): tags, notes, activity timeline (from `audit_log` plus module events).
- Later: segments, newsletter (Resend, only to contacts with `newsletter` consent).

### Events
- Events (date, venue, status, capacity), lineup/artists.
- **Ticketing**
  - Ticket types, each with a list of **tiers** (price, quota, sale window, order).
    The active tier is the first one that isn't sold out and is inside its window. When one sells out, the next one takes over automatically.
  - Inventory is changed **atomically in Postgres** (a function that locks the tier row). Checkout creates a short **hold** that expires, so tickets can't be oversold.
  - **Holds expire lazily**: availability counts only holds with `expires_at > now()`. Correctness doesn't depend on a cleanup job; the job only deletes old rows.
  - Holds are capped per session/IP and protected by a captcha (see Public → Abuse protection).
  - Price rules: group deals (buy 4, pay 3), promo codes, a max per order.
  - Tickets get a random code from an alphabet without look-alike characters, a QR code (generated on our own server), a PDF and an email. PDF and email are jobs.
  - **Scanner** needs the `tickets.scan` permission, refuses unpaid tickets and works offline with a sync queue:
    - The device downloads hashed codes for one event only.
    - Conflicts: first scan by device timestamp wins. On sync, a second scan shows "already scanned at 21:14 on device Door 2".
- **Guest & artist lists**
  - Lists per event; each list gives out links (label, quota, revocable).
  - The link opens a page where a promoter or artist adds their friends by name and optional email. Each guest becomes a 0€ ticket.
  - A link is a random token stored hashed in the database, and the database is the source of truth for whether it's revoked and how much of its quota is used (`public_add_guest` checks both in one locked statement).
- **Public pages**
  - Served on the Public surface (`clubname.roots.app`, wildcard domain on Vercel). Custom domains later.
  - Basic builder: a page is an ordered list of typed **blocks** (hero, text, image, lineup, ticket shop, FAQ) edited as a form. No drag-and-drop canvas.

### Shift planning (generic)
- Shifts and roles per event, or standalone. Members sign up, staff can swap shifts, availability tracking. Reminders are jobs.
- Works without Events, so a Verein can use it for its bar or training schedule.

---

## Roadmap

Changes from the previous version: a short hardening phase before any feature module, Events before Payments, and the first public event page moves into the ticketing phase (checkout is public anyway).

| Phase | Scope | Done when |
|---|---|---|
| **0 — Foundation** ✅ | Auth (email + magic link), orgs, members, roles/permissions, invites, audit triggers, `org_modules` + manifest registry, integrations core (Vault, `org_integrations`, registry, webhook inbox), app shell, German-first i18n | Two users in two orgs can't see each other's data; you can invite a user, give them a custom role, and see an audit trail |
| **0.5 — Hardening** | Webhook claim/lock, `jobs` table + worker endpoint, reserved slugs, `my_orgs()` RLS helper, audit opt-out + retention job, module disable checks, role permission validation, `public_*` function pattern with one example + isolation tests for `anon` | A webhook delivered twice in parallel is handled once; a failing job retries and succeeds; `anon` can't read any base table |
| **1 — Contacts** | Core contacts (dedupe, consent, erasure, import/export) + CRM module basics | Contacts can be created, imported, viewed with history, and erased including their audit entries |
| **2 — Events** | Events, venues, lineup in the App; minimal public event page (read-only) | `test.roots.app/events/x` shows a published event, and an unpublished one returns 404 |
| **3 — Payments + Ticketing** | Stripe Connect onboarding, money model, orders, webhook fulfilment, refunds, fees; ticket types/tiers, holds, public checkout, tickets/QR/PDF/email via jobs, scanner | End-to-end test event: buy on the public page, receive ticket by email, scan; a replayed webhook creates no duplicate tickets |
| **4 — Public sites** | Block-based page builder, org branding, caching with tags | An org builds its event page from blocks without help |
| **5 — Guest/artist lists** | Lists, links, self-service page | Promoter link adds guests who scan in; a revoked link stops working immediately |
| **6 — Shift planning** | Generic shifts, reminders | Verein plans a bar schedule |

Later: billing roots' own plans per org, German invoices, memberships (Vereinsverwaltung), custom domains (+ `org_domains`, host lookup cached in the proxy), slug history.

## Open questions
1. **Domain**: `roots.app` / `roots.de` / …? This sets the subdomain scheme.
2. ~~**Language**~~: decided — German-first with JSON message files, English as second language (done in phase 0).
3. **Stripe Connect account type**: Standard (orgs use their own full dashboard, simplest to run) vs Express (branded onboarding, we own more support). Leaning Standard.
4. **Roots' own pricing**: per-module subscriptions, a per-ticket fee, or both? This affects the `application_fee` and billing design.
5. **Job runner**: Vercel Cron calling `/api/cron/jobs` (simplest, minute granularity) vs Supabase Queues/pgmq + `pg_cron` (stays in the DB, sub-minute). Leaning Vercel Cron until the first job needs to run faster.
6. **Audit retention**: 24 months by default? Does any module need longer (bookkeeping data has 10-year retention under HGB/AO, but that belongs in invoices, not in the audit log)?
7. **Captcha provider**: Cloudflare Turnstile (no cookies, privacy-friendly) vs hCaptcha.
