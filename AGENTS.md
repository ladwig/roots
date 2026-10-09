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
- Architecture + roadmap: `PLAN.md` — read it before adding a module or table

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
- Server Actions report back through the URL: `back(path, { error | ok })` + `<Notice>`. Forms that must keep their state use `useActionState`.
- CRUD screens: `<DataTable>` (+ `<SearchBox>` `?q=`, `<Pager>` `?page=`) from `@/components/data-table`; clicking a row links to `?edit=<id>`, which renders `<UrlSheet params={["edit"]}>` (side drawer) with the edit form. "New" = `?new=<thing>` + `<UrlSheet>`. Build links with `withParams(sp, {...})` to keep other params. `<UrlDialog>` only for confirmations.
- Plain shadcn styling for now; the design system comes later.
- Roles are global (`roles.org_id is null`), defined by platform admins at `/admin/roles`, names stored as `{"de","en"}` (show with `t.pick(name)`). Orgs only assign roles; the org Roles tab is read-only. `org_id` on roles stays for possible org-specific roles later.
- Platform admins (superadmins, `platform_admins` table) pass every org check in the DB (`is_member/is_owner/has_perm` → true) and get `/admin` (orgs + users). `getContext().viaPlatform` = admin is inside an org they're not a member of. Grant the first one with `npm run admin:grant -- <email>`.
- Modules are switched on per org by platform admins only (`/admin/orgs` drawer); the org Modules tab is read-only.
- Modules: `src/modules/registry.ts` (key, requires, permissions, nav). Integrations: one file per provider in `src/integrations/`.
- Cache Components is on: the root layout has one `<Suspense>`, request-time pages export `instant = false`, and `getSession()` calls `connection()`. Read the session before creating other Supabase clients. Public pages should later get real static shells.

## Design system
- Tokens live in `src/app/globals.css` (`:root` + `.dark`, oklch). Change the look there, not per-component.
- Use semantic classes only: `bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`… **No raw colors** (`bg-blue-500`, hex) in components.
- Radius via `rounded-md/lg/xl` (derived from `--radius`). Spacing on Tailwind scale.
- Compose from `src/components/ui/*`; app-level components go in `src/components/`. Use `cn()` from `@/lib/utils` for class merging.
- Icons: `lucide-react` only.
- Every UI must work in light + dark and at 400px width. Accessible basics: labels on inputs, focus rings intact, real `<button>`/`<a>`.

## Translations (German first)
- No hardcoded UI text. Every string lives in `src/i18n/messages/de.json` (source of truth) and `en.json`. The build fails if `en.json` is missing a key.
- Server: `const t = await getT()` (`@/i18n/server`). Client: `const t = useT()` (`@/i18n/client`). `t("members.invite")`, `t("roles.memberCount", { count })` (plural groups `one`/`other`), `t.list([...])`, `t.date(value)`.
- Keys built at runtime (module/permission names): `t.dynamic(`modules.${key}.name`)`.
- Module texts: `modules.<key>.name/description`, permission labels: `permissions.<perm>`, integration texts: `integrations.<key>.*`.
- Database functions raise short codes (`raise exception 'last_owner'`) → add `errors.<code>` to both files; show them with `dbError(t, error)`. Supabase auth errors: `authError(t, error)`.
- Language = `locale` cookie → browser language → German. Public pages will later use the org's language.
- Adding a language: add a JSON file and the code to `locales` in `src/i18n/config.ts`.
- `npm test` runs `*.test.mjs` files (node --test).

## Two surfaces
- **App** (`src/app/(app)/`, `app.roots.app`): logged-in back office. Everything through RLS + permissions.
- **Public** (`src/app/(public)/[site]/`, `<org>.roots.app` + custom domains): outward-facing pages for anyone. Never expose unpublished data; public writes only via Server Actions that validate input + link tokens. Never import App-only code (admin queries, secret-key clients) into Public pages without a reason.

## URLs = state (deep-linkable everything)
Every view a user can reach must be shareable/bookmarkable and survive reload + back button.
- **Pages / sub-pages** → path segments: `/events/[eventId]/tickets` (no org in App URLs — active org is a cookie)
- **Tabs** → path segment if the tab is a real sub-page, else `?tab=lineup`. Tabs are `<Link>`s, not local state.
- **Filters, search, sort, pagination, view mode** → search params: `?q=max&status=paid&sort=-created_at&page=2`
- **Dialogs / sheets / drawers on a record** → search param: `?edit=<id>`, `?new=ticket-type`. Closing removes it.
- **Sections on long pages / settings** → `#anchor` ids on headings.
- Read params in Server Components via the `searchParams` prop; update from client with `router.replace` (filters) or `<Link>` (navigation). No `useState` for anything that should be in the URL.
- Keep params short, lowercase, stable — they are public API once shared.

## Conventions
- Prefer the simplest working thing: no abstractions, wrappers, or libraries until there's a second real use.
- Server Components by default; `"use client"` only for interactivity.
- `npm run lint` and `npm run build` must pass before committing.
- No AI attribution in commits or PRs (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
