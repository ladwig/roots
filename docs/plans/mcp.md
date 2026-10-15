# MCP server (Claude Desktop / claude.ai connector) – plan

Status: plan, not built. Researched against the code on 2026-10-15.

## Goal
Users add roots as a connector in Claude (Settings → Connectors → custom connector → URL), sign in to roots, pick an
org and an access level, and can then run and set up their org through Claude. Tools are generated from the key API
(`src/api/v1/*`), so the MCP grows with the API.

## Decisions (product owner, 2026-10-15)
- A connection belongs to **one person in one org** and acts with that person's rights. Everyone sees their own
  connections (Profile → "Meine Verbindungen"); admins see and can revoke all of the org's (Settings → API → "Verbundene Apps").
- Short-lived access tokens that refresh themselves: fine (one DB write per hour per active connection).
- Try **Supabase's OAuth 2.1 server (beta)** first (2-hour spike with Claude Desktop): its tokens are user JWTs, so RLS
  applies with the user's own rights; we only store the chosen org per connection. Fallback: our own authorization
  server issuing tokens as `api_keys` rows (`kind = 'oauth'`).
- Sensitive data (SEPA files, HR private data) is **not** hidden by default for now.
- Rate limits: yes, generous.
- New API write endpoints: team (invite / change / remove), assigning roles, custom fields. Role definitions stay with platform admins.
- Automation endpoints (catalog, validate, test run, templates) are added to the API anyway.

## Building blocks
1. **Transport:** `src/app/api/mcp/route.ts`, Streamable HTTP, stateless (`WebStandardStreamableHTTPServerTransport`,
   `sessionIdGenerator: undefined`, JSON responses), low-level SDK `Server` with raw JSON Schema. Add
   `@modelcontextprotocol/sdk` as a direct dependency. Proxy: `/api/mcp`, `/api/oauth` public; `/.well-known`, `/oauth` not under `/app`.
2. **Auth (spec 2025-06-18 / 2025-11-25, verify before building):** 401 with `WWW-Authenticate: Bearer resource_metadata=…`,
   protected resource metadata (RFC 9728), authorization server metadata (RFC 8414), PKCE S256, `resource` (RFC 8707),
   client registration via DCR and/or client ID metadata documents. Claude callback `https://claude.ai/api/mcp/auth_callback` (verify).
   Plain API keys also work (`Authorization: Bearer roots_…`) for Claude Code and scripts.
3. **Core refactor:** split `dispatch()` in `src/api/core.ts` into `authenticate` / `allowed` / `invoke` so MCP calls
   handlers in-process with exactly the same checks and DB headers.
4. **Tools from the registry (no 240-tool flood):**
   - discovery: `roots_whoami`, `roots_find_operations`, `roots_describe_operation`
   - generic callers split by risk: `roots_read` (GET), `roots_write`, `roots_danger` (DELETE, emails, money, irreversible)
   - ~20 promoted first-class tools (contacts, events, memberships, dues, forms, automations) via `mcp: "tool"` on the endpoint
   - `?tools=all` = one tool per endpoint for clients with tool search
   - `Endpoint` gets optional `name` (operationId), `effects`, `sensitive`, `mcp`; annotations derived (readOnly/destructive/idempotent/openWorld)
5. **Automations via Claude:** new endpoints `GET /workflows/catalog`, `POST /workflows/validate` (plain-language problems,
   auto layout), `GET /workflows/test-samples`, `POST /workflows/test`, `GET /workflow-templates`; positions optional on
   create/update. Loop: catalog → draft → validate → test → create (inactive) → summary → activate after confirmation.
6. **Safety:** two-step confirm token for dangerous calls (preview → HMAC token, 5 min), rate limit counter in
   `api_key_auth()`, `api_calls` log (no contents), audit actor from the key's creator instead of "no actor",
   per-org "Allow AI connectors" switch + `MCP_ENABLED` env kill switch.

## Phases (~10–11 days; less with Supabase OAuth)
| Phase | Content | Time |
|---|---|---|
| 0 | API core split, `Endpoint` metadata, OpenAPI operationId | ½ d |
| 1 | MCP over API keys (Claude Code ready) | 2 d |
| 2 | OAuth + consent page + "Verbundene Apps" / "Meine Verbindungen" (spike Supabase OAuth first) | 1–3 d |
| 3 | Automation endpoints + tools | 2 d |
| 4 | Safety (confirm tokens, rate limits, call log, audit actor, kill switch) | 2 d |
| 5 | Descriptions pass, prompts ("set up a club with dues"…), resources, docs "Connect Claude" | 1–1½ d |

Test with MCP Inspector (`npx @modelcontextprotocol/inspector`, Streamable HTTP, `http://localhost:3000/api/mcp`),
Claude Code (`claude mcp add --transport http roots <url>`), and Claude Desktop against production or a tunnel
(preview deployments are behind Vercel protection).
