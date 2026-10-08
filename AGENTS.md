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
- Schema changes = migration files in `supabase/migrations/` (via MCP `apply_migration` or `npx supabase migration new`). No ad-hoc DDL.
- After schema changes, regenerate types: `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts`
- Run the Supabase security advisor after adding tables/policies.

## Design system
- Tokens live in `src/app/globals.css` (`:root` + `.dark`, oklch). Change the look there, not per-component.
- Use semantic classes only: `bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`… **No raw colors** (`bg-blue-500`, hex) in components.
- Radius via `rounded-md/lg/xl` (derived from `--radius`). Spacing on Tailwind scale.
- Compose from `src/components/ui/*`; app-level components go in `src/components/`. Use `cn()` from `@/lib/utils` for class merging.
- Icons: `lucide-react` only.
- Every UI must work in light + dark and at 400px width. Accessible basics: labels on inputs, focus rings intact, real `<button>`/`<a>`.

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
