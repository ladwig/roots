# roots

Modular SaaS for German Vereine, small businesses, artists and promoters: one back office with modules an org switches on (CRM, payments, events, ticketing, …) plus public pages for their audience.

Production: https://roots-berlin.vercel.app · API docs: https://roots-berlin.vercel.app/api/docs

## What's in it

| Area | What it does |
|---|---|
| **Core** | Orgs, team, invites, global roles + permissions, platform admins (`/admin`), audit log, soft delete + trash, i18n (de/en), dark mode, profile pictures + org logos |
| **CRM** | Contacts, tags, notes + timeline, custom fields (Settings → Felder), CSV import with column mapping |
| **Events** | Events with public pages (`<org>.<domain>` or `/s/<org>`), drafts, cancel, images |
| **Ticketing** | Ticket types, price tiers, promo codes / discount links, hidden crew types, checkout with names per ticket, QR tickets + PDF + email, scanner with offline mode |
| **Payments** | Orders, payments, refunds; Stripe (Connect OAuth, hosted onboarding or the org's own API key) and SumUp (OAuth or the org's own API key) |
| **Quotes & invoices** | German invoices (§ 14 UStG, Kleinunternehmer), number ranges, builder, issue + freeze, quote → invoice, print templates |
| **Guest lists & lineup** | Permanent and per-event guest lists with magic links, optional tickets, door check-in; artists + timetable |
| **Shift planning** | Team (members), positions, locations, shifts per event or location, recurring series, applications, check-in/out + hours, calendar views |
| **Files** | Private file storage per org: attach files to any record (contacts, memberships…), Files page with folders + trash, photos compressed in the browser |
| **Members** | Vereinsverwaltung: membership types (fee, interval, entry fee, notice, pro rata), memberships on contacts with number format + SEPA mandates, dues (periods, entry fees, levies), SEPA direct debit files (pain.008), reminders, cancel with notice |
| **Forms** | Form builder over platform fields (contact, custom, membership), public forms with consents + SEPA mandate, submissions inbox; membership applications become members |
| **Event hub** | Things that happen (`ticket.sold`, `contact.created`, …) → in-app inbox, email, webhooks, Telegram |
| **Public API** | Per-org API keys with permissions, `/api/v1` (events, tickets, contacts, members + dues, forms + submissions, files, invoices), OpenAPI spec + interactive docs |

Roadmap and architecture decisions: [`PLAN.md`](PLAN.md). Rules for working in the code (humans and AI agents): [`AGENTS.md`](AGENTS.md).

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions, Cache Components), React 19, TypeScript
- **Supabase**: Postgres with row-level security on every table (tenant isolation lives in the database), Auth, Storage, Vault for secrets, pg_cron
- **UI**: Tailwind v4, shadcn/ui on Base UI, lucide icons; theme tokens in `src/app/theme.css`
- **Hosting**: Vercel (functions in `lhr1`, next to the database in eu-west-2)
- **Payments**: Stripe, SumUp · **Email**: Resend · **Messaging**: Telegram bots
- Small libraries only where needed: `zod` (API validation + OpenAPI), `pdf-lib` + `qrcode` (tickets), `jsqr` (scanner fallback)

### How it fits together

```
Browser ──► Next.js (Vercel)
             ├─ App  (src/app/(app), /admin)   Server Components read Supabase directly,
             │                                  Server Actions write; RLS decides what's allowed
             ├─ Public pages (src/app/s/[site]) anonymous client, only published data (anon policies + column grants)
             ├─ /api/v1                         API keys → same validation as the app forms
             ├─ /api/webhooks/<provider>        Stripe, SumUp, Telegram → stored once, then handled
             └─ /api/cron/events                worker: event deliveries, trash purge (called every minute by Supabase pg_cron)
Supabase ── Postgres (RLS, triggers, definer functions), Auth, Storage (images), Vault (integration secrets)
```

Every org-scoped table has `org_id`, audit columns, RLS policies via `has_perm(org, '<module>.<action>')` and checks in `supabase/tests/isolation.sql`.

## Local setup

Requirements: Node 24, a Supabase project.

```bash
npm install
cp .env.example .env.local      # fill in Supabase URL/keys + DATABASE_URL (session pooler)
npm run db:push                 # apply migrations
npm run db:types                # regenerate src/lib/supabase/types.ts
npm run dev                     # http://localhost:3000
npm run admin:grant -- you@example.com   # make your account a platform admin (after signing up)
```

Public pages locally: `http://<org-slug>.localhost:3000` (or `/s/<org-slug>`). Telegram and payments work without a public URL (`TELEGRAM_POLLING=1`, `stripe listen --forward-to localhost:3000/api/webhooks/stripe`).

### Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (`*.test.mjs`, node --test) |
| `npm run db:push` | Apply new migrations from `supabase/migrations/` |
| `npm run db:types` | Regenerate database types |
| `npm run db:test` | Tenant isolation / RLS checks (must print "all checks passed") |
| `npm run worker` | Run the event worker locally in a loop |
| `npm run worker:schedule -- <url>` | Let Supabase pg_cron call the worker every minute (`off` to stop) |
| `npm run admin:grant -- <email>` | Make a user a platform admin |

### Payment providers

**Stripe (platform, for Connect)**: in the Stripe dashboard (test mode first, then the same again in live mode):
- Settings → Connect → Onboarding options → OAuth: enable OAuth, add the redirect URIs `<APP_URL>/api/integrations/stripe/callback` (production + `http://localhost:3000`), copy the client id (`ca_…`) → `STRIPE_CLIENT_ID`.
- Developers → API keys → restricted key (`rk_…`) → `STRIPE_SECRET_KEY`. It needs **two** permission sets:

  | Set | Permission | Level | Used for |
  |---|---|---|---|
  | Your account (platform) | Connect: Accounts | Write | OAuth code exchange, Accounts v2 (create/read connected accounts) |
  | Your account (platform) | Account Links | Write | hosted onboarding for new accounts |
  | Connected accounts | Checkout Sessions | Write | ticket checkouts on the org's account |
  | Connected accounts | Charges and Refunds | Write | refunds |
  | Connected accounts | Webhook Endpoints | Write | |

  Check: `curl -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/accounts?limit=1` must not say "Permission denied".
- Developers → Webhooks → endpoint `<APP_URL>/api/webhooks/stripe` listening to **connected accounts** (`checkout.session.*`, `charge.refunded`) → `STRIPE_WEBHOOK_SECRET`.

**Stripe (an org's own key, no Connect)**: entered by the org in Settings → Integrations; the dialog lists the permissions (Checkout Sessions, Charges and Refunds, Webhook Endpoints: Write; Accounts: Read optional). roots registers the org's webhook endpoint itself.

**SumUp**: developer.sumup.com → OAuth app (type Web), redirect URIs `<APP_URL>/api/integrations/sumup/callback` (production + localhost), no origin URL needed → `SUMUP_CLIENT_ID` / `SUMUP_CLIENT_SECRET`. Taking payments needs the `payments` scope, which SumUp grants after reviewing the app; until then orgs connect with their own API key (`sup_sk_…`, SumUp → Developers → API keys). Webhooks need no setup in either case: each checkout carries its notify URL, and roots re-reads the status from SumUp.

## Deployment

- Vercel project `roots`, connected to this repo: every push to `main` deploys production.
- Env vars live in Vercel (Production + Preview), same names as `.env.example`. `NEXT_PUBLIC_*` are baked in at build time: redeploy after changing them.
- After the first deploy (or a domain change): `npm run worker:schedule -- https://<production-url>` (`CRON_SECRET` must match Vercel's), and set Supabase Auth → URL Configuration (Site URL + redirect URLs) to the production URL.
- Org subdomains need a real domain with a wildcard DNS entry; on `*.vercel.app` public pages live under `/s/<org>`.

## Project layout

```
src/app/(app)/       back office (events, contacts, payments, settings, scanner, …)
src/app/admin/       platform admin
src/app/s/[site]/    public pages per org (events, ticket shop, buyer tickets)
src/app/api/         API v1, webhooks, cron, integrations OAuth
src/api/             API endpoint definitions + OpenAPI generation
src/modules/         module registry (permissions, nav)
src/integrations/    one file per provider (Stripe, SumUp, Telegram, Resend)
src/payments/        orders, checkout, refunds, provider adapters
src/events/          event hub: registry, router, channels, worker
src/tickets/         ticket logic, PDF, prices
src/lib/             context/permissions, Supabase clients, CSV, custom fields, time, URLs
src/i18n/            translations (de = source of truth, en)
supabase/migrations/ schema (never edit an applied migration; add a new one)
supabase/tests/      isolation.sql
```
