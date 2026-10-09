# Roots — Plan

Modular SaaS for small organisations (German Vereine, small businesses, event promoters).
Each org turns on the modules it needs. Every module works alone, and modules link up when they're used together.
The UI stays simple even when the system behind it isn't.

## Principles
- **Foundation first.** Tenancy, permissions, audit and modules are built before any feature module.
- **One database, one app.** Modules are folders plus table prefixes, not separate services.
- **RLS is the security boundary.** The UI hides what you can't use, and the database refuses it.
- **Dependencies only go one way.** Ticketing may use Payments and Contacts; Payments knows nothing about events.
- `sidequest` is **inspiration only**: borrow product ideas, not code or schema.

---

## Architecture

### Tenancy
- `orgs` (id, slug, name, settings): the slug becomes the subdomain, e.g. `clubname.roots.app`.
- `org_members` (org_id, user_id, role_id). A user can belong to many orgs, and there's an org switcher in the app.
- Every business table has an `org_id`, and every RLS policy is scoped to it.

### Roles & permissions (simple but flexible)
- **Permissions** are strings that each module declares: `events.view`, `events.manage`, `tickets.scan`, `crm.view`, `payments.refund`, `org.members.manage` and so on.
- **Roles** are named sets of permissions, stored per org. They're seeded with *Owner*, *Admin*, *Member* and *Door staff*, and orgs can create custom roles by ticking checkboxes.
- One SQL helper, `has_perm(org_id, 'events.manage')`, is used by RLS policies, Server Actions and the page/nav guards.
- There are no per-record ACLs. Add them only when a real case needs one.

### Invites
- `invites` (org_id, email, role_id, token_hash, expires_at, accepted_at, invited_by).
- The email link opens an accept page, which signs the person in or up and creates the `org_members` row.
- Tokens are stored hashed and are single-use.

### Audit (everything)
- Every table has `created_at`, `created_by`, `updated_at` and `updated_by`, filled by one shared trigger (`auth.uid()`). App code never sets them.
- `audit_log` (org_id, table, row_id, action, actor_id, at, old, new as jsonb diff) is written by one generic trigger attached to every business table.
- One "Activity" view per record and per org can read it.

### Modules
- Definitions live in `src/modules/registry.ts` (key, `requires`, permissions, nav entries); a module moves to `src/modules/<key>/` once it has its own code.
- The DB table `org_modules` (org_id, module_key, enabled_at) records what's on.
- Turning a module on checks `requires`. Ticketing, for example, says "needs Payments + Contacts → enable both?"
- RLS checks `module_enabled(org_id, 'events')`, so a module that's off is really off.
- Tables are prefixed by module (`evt_*`, `pay_*`, `crm_*`, `shift_*`), with core tables unprefixed.

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
- **One OAuth flow** for all oauth2 providers: `/api/integrations/[provider]/callback`, signed `state` (org + user + nonce), token refresh handled centrally.
- **One webhook entry**: `/api/webhooks/[provider]` → verify signature → insert into `integration_events` (provider, external_id **unique**, payload, processed_at, error) → process.
  Gives idempotency, retries and replay for free.
- **Modules declare what they need**: `requires: { modules: ["contacts"], integrations: ["stripe"] }` → enabling Ticketing prompts "connect Stripe".
- Using a credential is audited (who connected/rotated/removed what); secret values never appear in `audit_log`.

### Two surfaces: App vs Public
One Next.js codebase, split by host in `proxy.ts` and by route groups:

| | **App** (back office) | **Public** (outward-facing) |
|---|---|---|
| Who | Org members (logged in) | Anyone: ticket buyers, guests, artists, visitors |
| Host | `app.roots.app` | `<org>.roots.app`, later custom domains (`tickets.myclub.de`) |
| Code | `src/app/(app)/…` | `src/app/(public)/[site]/…` (proxy rewrites host → `[site]`) |
| Auth | Supabase session + permissions | None, or scoped link tokens (guestlist link, ticket access) |
| Data | Through RLS as the member | Only `published` content via narrow public views / RPCs; writes (checkout, guest add) only via Server Actions that validate the token |
| Look | roots design system | Org branding (logo, colors, font) on top of the same components |

Public content is examples like: event pages, ticket shop, checkout, ticket download, guestlist self-service, artist forms, shift signup, a simple org website.
Modules contribute to both: e.g. Events = event management in the App + event page / ticket shop on Public.

### URLs
- **App**: `app.roots.app/<module>/<id>/<tab>` — e.g. `/events/8f2c…/tickets?tier=early`. **No org in the path.**
  - Active org = cookie (`active_org`), falls back to the user's last used org; switching org is a menu action.
  - Record ids are UUIDs, so a shared link to a record in another of your orgs resolves the record's org and switches automatically; no access → 404.
- **Public**: `<org>.roots.app/<page>` — e.g. `/events/summer-rave`, `/g/<token>` (guestlist link). Slugs, not ids, for anything SEO/shareable.
- All UI state (tabs, filters, sort, page, open dialog, section anchor) lives in the URL — rules in `AGENTS.md`.

### Cross-module glue
- **Contacts are core, and CRM is a module on top.** Ticket buyers, guests, members and customers are all `contacts`. CRM adds tags, notes, segments and timeline UI.
- **Payments are generic.** `pay_orders` and `pay_order_items` reference what was bought with `(source_module, source_id)`. Ticketing creates orders, and later Memberships or Invoices create orders too.

---

## Modules

### Payments
- **Stripe Connect.** Each org connects or onboards its own Stripe account; roots takes an `application_fee`. Choose the account type early (see open questions).
- Orders, payments and refunds. Tickets and other fulfilment are created **only from the webhook**, and duplicate webhook events are ignored.
- Fee pass-through: optionally gross the price up so the buyer pays the fee.
- Later: invoices (German-compliant numbering and PDF), SEPA, payouts overview.

### Contacts / CRM
- Contacts, tags, notes, activity timeline (from `audit_log` plus module events), CSV import/export.
- Later: segments, newsletter (Resend).

### Events
- ✅ Events (date/time in Berlin time, venue, description, image, status draft/published/cancelled, capacity), soft delete + trash, public list + event page, hub events `event.published/updated/cancelled`.
- Next: lineup/artists, public API (`/api/v1`, org API keys, OpenAPI docs page).
- **Ticketing**
  - Ticket types, each with a list of **tiers** (price, quota, sale window, order).
    The active tier is the first one that isn't sold out and is inside its window. When one sells out, the next one takes over automatically.
  - Inventory is changed **atomically in Postgres** (a function that locks the row). Checkout creates a short **hold** that expires, so tickets can't be oversold.
  - Price rules: group deals (buy 4, pay 3), promo codes, a max per order.
  - Tickets get a random code from an alphabet without look-alike characters, a QR code (generated on our own server), a PDF and an email.
  - Scanner page needs the `tickets.scan` permission, works offline with a sync queue, and refuses unpaid tickets.
- **Guest & artist lists**
  - Lists per event; each list gives out links (label, quota, revocable).
  - The link opens a page where a promoter or artist adds their friends by name and optional email. Each guest becomes a 0€ ticket.
  - A link is a random token stored hashed in the database, and the database is the source of truth for whether it's revoked and how much of its quota is used.
- **Public pages**
  - Served on the Public surface (`clubname.roots.app`, wildcard domain on Vercel). Custom domains later.
  - Basic builder: a page is an ordered list of typed **blocks** (hero, text, image, lineup, ticket shop, FAQ) edited as a form. No drag-and-drop canvas.

### Shift planning (generic)
- Shifts and roles per event, or standalone. Members sign up, staff can swap shifts, availability tracking.
- Works without Events, so a Verein can use it for its bar or training schedule.

---

## Roadmap

| Phase | Scope | Done when |
|---|---|---|
| **0 — Foundation** ✅ | Auth (email + magic link), orgs, members, roles/permissions, invites, audit triggers, `org_modules` + manifest registry, integrations core (Vault, `org_integrations`, registry, webhook inbox), app shell (org switcher, nav from enabled modules + permissions, settings) | Two users in two orgs can't see each other's data; you can invite a user, give them a custom role, and see an audit trail |
| **1 — Contacts** | Core contacts + CRM module basics | Contacts can be created, imported and viewed with history |
| **2 — Payments** | Stripe Connect onboarding, orders, webhook, refunds, fee handling | Test org connects Stripe and takes a test payment |
| **3 — Events + Ticketing** | Events, ticket types/tiers, holds, checkout, tickets/QR/PDF/email, scanner | End-to-end test event: buy, receive ticket, scan |
| **4 — Public sites** | Subdomains, block-based event pages | `test.roots.app` sells tickets |
| **5 — Guest/artist lists** | Lists, links, self-service page | Promoter link adds guests who scan in |
| **6 — Shift planning** | Generic shifts | Verein plans a bar schedule |

### Ideas / next building blocks
- **Public API** (next): org API keys, `/api/v1/...`, OpenAPI + docs page. Events first.
- **CSV import (generic)**: upload → map file columns to our fields (auto-guess by header, remember per org) → preview with row errors → import. Each module only declares its importable fields + validation (contacts first, then events, guests…). Same declaration later drives CSV export.
- **Event reach without APIs**: schema.org `Event` JSON-LD on public event pages (Google events), `.ics` per event + calendar feed per org, share links. Resident Advisor and Facebook have no public create-event API (manual submit / copy-paste text); Eventbrite has one (later integration if wanted).

Later: billing roots' own plans per org, German invoices, memberships (Vereinsverwaltung), custom domains.

## Open questions
1. **Domain**: `roots.app` / `roots.de` / …? This sets the subdomain scheme.
2. **Language**: German-first UI with English later? This decides whether i18n goes in during phase 0.
3. **Stripe Connect account type**: Standard (orgs use their own full dashboard, simplest to run) vs Express (branded onboarding, we own more support). Leaning Standard.
4. **Roots' own pricing**: per-module subscriptions, a per-ticket fee, or both? This affects the `application_fee` and billing design.
