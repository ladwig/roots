# Roots — Plan v2: technical & architecture recommendations

> **Status: recommendations, not binding.** `plan-v1.md` stays the plan. Code built on v1 stays as it is; each point below is a proposal to pick up, adjust or reject.
> Based on `main` at `7d563e9` (2026-10-11): payments, ticketing, guest lists, lineup, invoices, shifts, event hub, soft delete, public API.

Each recommendation has: **Finding** (what the code does today, with file), **Recommendation**, **Effort** (S < ½ day, M ≈ 1–2 days, L > 2 days).

---

## What to keep

These choices hold up well and the recommendations build on them:
- One Postgres, RLS as the boundary, `request_org()` header as a safety net against cross-org queries.
- Inventory locked in Postgres (`reserve_tickets`, `for update`), reservations that expire lazily (`expires_at > now()` in the count).
- Event hub with a lease-based queue (`claim_event_deliveries` + `for update skip locked`, backoff in `finish_event_delivery`).
- Payments as a generic service with a fulfilment registry; the provider, not the browser, confirms payment (`reconcileOrder` as a backup).
- Money documents numbered only when issued, then frozen; corrections only by cancellation.
- API keys stored as hashes, OpenAPI generated from the same zod schemas.
- Clear data lifecycle rules (soft delete / hard delete / never delete) in `AGENTS.md`.

---

## 1. Correctness & security (fix first)

### 1.1 API keys can carry more rights than their creator ✅ (fixed 2026-10-12)
- **Finding:** `createApiKey` (`src/app/(app)/settings/api/actions.ts:21`) allows every permission of every enabled module. Someone with only `org.integrations.manage` can create a key with `crm.manage` or `payments.refund`.
- **Recommendation:** only offer and accept permissions the creator has: `.filter((p) => allowed.has(p) && ctx.can(p))`. Add an assertion to `isolation.sql` or a unit test.
- **Effort:** S

### 1.2 Webhook inbox: parallel deliveries are processed twice
- **Finding:** `src/app/api/webhooks/[provider]/route.ts` reads `processed_at` and then runs `handle()`. Two deliveries of the same event at the same time (providers do this on retries) both see `processed_at = null`.
- **Recommendation:** claim the event before handling: add `locked_at` to `integration_events`, then run
  `update … set locked_at = now() where id = $1 and processed_at is null and (locked_at is null or locked_at < now() - interval '5 minutes') returning id`.
  If nothing comes back, answer 200 and stop.
- **Effort:** S

### 1.3 Fulfilment can run twice → ticket email sent twice
- **Finding:**
  - `fulfil()` (`src/payments/server.ts:147`) checks `fulfilled_at`, runs `onPaid`, then sets `fulfilled_at`. That's check-then-act.
  - The webhook and `reconcileOrder()` race each other. The buyer page calls `reconcileOrder()` on every auto-refresh while the order is pending (`src/app/s/[site]/t/[order]/page.tsx:20`).
  - `issueTickets()` sends the email on every call (`src/tickets/server.ts:106`), even when no ticket changed.
- **Recommendation:**
  - Claim atomically: `update pay_orders set fulfilled_at = now() where id = $1 and fulfilled_at is null returning id`. Only the winner runs `onPaid`; on error, reset `fulfilled_at` to null so the retry can run.
  - In `issueTickets`, send the email only if the `reserved → valid` update changed rows (`count: "exact"`).
- **Effort:** S

### 1.4 Guest list links can create duplicate tickets
- **Finding:** `syncTickets()` (`src/guestlists/server.ts:12`) loops over all entries of a list and creates an order + ticket for each entry without one. Two submissions to the same link at the same time run the loop in parallel, and both create tickets for the same entries. The orphaned ticket stays `valid`. The loop also costs about 3 sequential queries per entry, roughly 70 ms each.
- **Recommendation:** create the free order + ticket inside `guest_link_add()` (one transaction, the quota is already locked there), or at least add `unique (guest_entry_id)` on the order/ticket link so the second insert fails cleanly. Do the same for the App-side list edits.
- **Effort:** M

### 1.5 Late payment after the reservation expired can oversell
- **Finding:**
  - Reservations live 31 min (`RESERVE_MINUTES`), the checkout 30 min.
  - If the webhook arrives late (provider retry after an outage), `issueTickets` turns `reserved` into `valid` without checking `expires_at`.
  - In between, the spot may have been sold again.
- **Recommendation:** validate through a DB function that re-checks the quota under the same lock as `reserve_tickets`. If the event is now over quota: keep the order paid, mark it `needs_attention` (or refund automatically), and emit an event so the org is told.
- **Effort:** M

### 1.6 SumUp token refresh can lock the org out
- **Finding:** `sumupToken()` (`src/integrations/sumup.ts:33`) refreshes without a lock. Two parallel requests both refresh; with rotating refresh tokens, the second refresh token is invalid, and the connection breaks until the org reconnects.
- **Recommendation:** serialise the refresh, either with `pg_advisory_xact_lock(hashtext(org || provider))` in a small `refresh_integration` DB function, or a `refreshing_until` column with a conditional update. After getting the lock, re-read the secret, because another request may already have refreshed it.
- **Effort:** S

---

## 2. Architecture

### 2.1 One job queue for all side effects
- **Finding:** the event hub already has a good queue, but only for hub deliveries. Other side effects run inside the request:
  - Ticket PDF + email run inside the webhook request (`issueTickets` → `emailTickets`).
  - Shift series and the Telegram poll run in the cron route, one after the other.
  - A failing step in `/api/cron/events` (e.g. `deliverDue` throws) skips the rest, including `purge_deleted`.
- **Recommendation:**
  - Generalise the pattern into a `jobs` table (`kind`, `payload`, `dedupe_key unique`, `run_at`, `attempts`, `locked_until`, `last_error`) with the same claim/finish functions.
  - Enqueue in the same transaction as the business change (outbox). Ticket email = job `tickets.email` with `dedupe_key = order_id`, which also solves the double email in 1.3 at the root.
  - In the cron route: wrap each step in its own `try/catch`, and keep a time budget so the function stays under the Vercel limit.
  - Hub deliveries can stay as they are; later they can become one `kind`.
- **Effort:** M

### 2.2 Multi-step money/inventory writes in one transaction
- **Finding:**
  - `createOrder()` (`src/payments/server.ts:40`) inserts the order and its items in two separate calls.
  - `buyTickets()` runs order → reserve → compare price → compensate on mismatch.
  - `syncTickets()` runs order → ticket → entry.
  - Each step is a separate HTTP round trip without a transaction. A crash in between leaves half-written data (an order without items, an open order without tickets).
- **Recommendation:** move writes that touch money or inventory into one DB function each, e.g. `create_ticket_order(event, items, code, buyer)` returning the order + reserved tickets. The provider call (Stripe checkout) stays outside, after the commit. Rule for new modules: if a write has more than one step and involves money or quota, it's an RPC.
- **Effort:** M per flow

### 2.3 Service role on the public surface: fence it in
- **Finding:**
  - Public pages read with `createPublicClient()` (good).
  - Public writes and the buyer page go through `src/tickets/server.ts` and `src/guestlists/server.ts`, which use the admin client for everything.
  - Only `src/payments/server.ts` and `src/lib/stripe.ts` import `server-only`.
  - The API also runs on the admin client, with an app-side `org_id` filter in each handler (`src/api/core.ts`, already noted there as a shortcut).
- **Recommendation:**
  - Add `import "server-only"` to every module that creates an admin client.
  - An ESLint `no-restricted-imports` rule: `@/lib/supabase/admin` may not be imported from `src/app/s/**` or from any `*.tsx`.
  - Rule in `AGENTS.md`: public flows touch the database with the admin client only to call a definer RPC that checks everything itself (like `reserve_tickets`, `guest_link_add`).
  - API: add a test that runs every endpoint with a key from org A against data from org B. Move to per-key JWTs + RLS once the API can write more than a few entities.
- **Effort:** S (rules), M (API test)

### 2.4 RLS cost on large tables
- **Finding:** each row check calls `has_perm()` or `is_member()`, which parse the `x-org-id` header (`request_org()`), check `is_platform_admin()` and join `org_members` + `roles`. That's cheap for settings tables. On lists like tickets, contacts, shifts and audit with 10k+ rows, it runs once per row.
- **Recommendation:**
  - Measure first: `explain analyze` the ticket list of an event with 10k seeded tickets.
  - If it's slow, use a set-returning helper that runs once per query, `org_id in (select public.my_orgs('tickets.view'))`, for the big tables only.
  - Make sure every RLS-filtered table has an index starting with `org_id`.
- **Effort:** S (measure), M (switch)

### 2.5 Abuse protection on public endpoints
- **Finding:** checkout, guest link submissions and the API have no rate limit and no captcha. A script can reserve the whole stock every 31 minutes, flood a guest list until its quota is full, or hammer the API with a stolen key.
- **Recommendation:**
  - Checkout: cap open reservations per email and per IP inside `reserve_tickets` (count `reserved` tickets for that email/IP in the last 30 min). Add a captcha (Cloudflare Turnstile, cookie-free) on checkout and guest forms.
  - API: a simple per-key counter in Postgres (requests per minute, a window column in `api_keys`) answering 429. Vercel firewall rules as an extra layer when on Pro.
- **Effort:** M

### 2.6 Privacy (DSGVO)
- **Finding:**
  - `audit_log` stores full row diffs forever, with no FK, so contact emails, names and addresses stay after a hard delete. The GDPR rule in `AGENTS.md` ("hard delete, anonymise references") doesn't cover the log.
  - Ticket buyers automatically become contacts tagged "Tickets". There's no consent record, so it can't later be told apart who may get a newsletter.
  - The offline scanner downloads all codes and holder names of an event in plain text onto door devices (`src/app/(app)/scan/actions.ts`).
  - Data runs in London (`lhr1` / `eu-west-2`).
- **Recommendation:**
  - Audit retention (e.g. 24 months, deleted by the worker), plus an `erase_person(email)` function that removes or redacts personal fields in `audit_log` and anonymises orders (money rows stay, personal data goes).
  - `contact_consents` (purpose, granted_at, source, revoked_at) before any newsletter feature.
  - Scanner: store SHA-256 hashes of codes, show the name only after a match; clear the device list after the event.
  - Region: the UK has an EU adequacy decision, so London is legal. But for German Vereine "data in Frankfurt (eu-central-1)" is a sales argument, and moving a database later is expensive. Decide now (see open questions).
- **Effort:** M (audit/erasure), S (consent table), S (scanner)

### 2.7 Tax on order items
- **Finding:** `pay_order_items` stores description, quantity and amount, but no tax rate. Invoices have their own items with 19/7/0 %. A ticket order can't produce a correct receipt or invoice (7 % for many events, 19 % for others, 0 % for Kleinunternehmer).
- **Recommendation:** add `tax_rate` (and optionally `tax_cents`) to `pay_order_items`, filled by the selling module (ticket type gets a tax rate, default from the org's tax settings). This is the precondition for "invoice from order" and for B2B buyers who ask for an invoice.
- **Effort:** S–M

---

## 3. Engineering hygiene

### 3.1 CI
- **Finding:** there's no `.github/workflows`. `lint`, `build`, `npm test` and `db:test` only run when someone remembers; only Vercel's build check runs on PRs.
- **Recommendation:** one GitHub Action: `npm ci`, `npm run lint`, `npm test`, `npm run build`. `db:test` against a Supabase branch (or a local `supabase start`) on PRs that touch `supabase/`.
- **Effort:** S

### 3.2 Observability
- **Finding:** errors go to `console.error` (ticket email, reconcile, cron steps). Failed hub deliveries and unprocessed `integration_events` are only visible in the database.
- **Recommendation:**
  - Error tracking (Sentry has a Next.js SDK, with a free tier).
  - A small `/admin/health` page: unprocessed webhook events older than 10 min, failed deliveries and jobs, orders paid but not fulfilled, last worker run.
  - The worker writes a heartbeat row so you notice when pg_cron stops.
- **Effort:** S–M

### 3.3 Preview deployments and data
- **Finding (to check):** Vercel env vars are set for Production + Preview. If both point to the same Supabase project and Stripe keys, preview deployments of PRs write into production data.
- **Recommendation:** Preview → its own Supabase project or branch + Stripe test keys only. Production keys only in the Production environment.
- **Effort:** S

### 3.4 Smaller points
- **Reserved slugs:** refuse `app`, `www`, `api`, `admin`, `mail`, `docs`, `status` in `create_org` / the slug check. `app.<root>` is the App, so an org named `app` would get no site.
- **Contact from ticket buyer:** `issueTickets` inserts the contact and ignores a unique violation (`contactId` stays null when two orders with the same email arrive together). Use an upsert on `(org_id, email)`.
- **`markRefunded`:** looks up refunds by `provider_payment_ref` only, without the provider. Add `provider` to the filter.
- **Vendored ReUI calendar** (`src/components/reui/`, ~10k lines): fine as vendored code. Keep it unmodified where possible, so updates stay a copy, and put changes in `calendar-view.tsx`.

---

## Suggested order

| Step | Content | Effort |
|---|---|---|
| A | 1.1 API key rights, 1.2 webhook claim, 1.3 fulfilment claim + email only once, 1.6 SumUp lock, 3.4 small points | ~1 day |
| B | 3.1 CI, 3.3 check preview env, 3.2 error tracking + health page | ~1–2 days |
| C | 2.1 job queue (ticket email as first job), 2.2 `create_ticket_order` RPC, 1.4 guest tickets in the DB function, 1.5 late payment check | ~3–4 days |
| D | 2.3 admin client fence + API isolation test, 2.5 abuse protection | ~2 days |
| E | 2.6 privacy (audit retention/erasure, consent, scanner hashes), 2.7 tax on order items, 2.4 measure RLS | ~3 days |

## Open questions
1. **Region:** stay in London, or move to Frankfurt (`eu-central-1`) before real customers arrive?
2. **Audit retention:** how long? 24 months is proposed. Bookkeeping data has 10-year retention (HGB/AO), but that lives in invoices and orders, not in the change log.
3. **Late payments over quota (1.5):** refund automatically, or let the org decide?
4. **Captcha:** Cloudflare Turnstile (cookie-free) or none at first, with only the reservation caps?
