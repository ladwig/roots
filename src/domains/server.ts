// Own domains: connect, check, remove. Vercel serves the domain (and issues the certificate); we keep one row per org
// with the records to enter and whether it's live. The App, the API and the worker all go through these functions.
// Needs VERCEL_TOKEN + VERCEL_PROJECT_ID (+ VERCEL_TEAM_ID for team projects).
import { createAdminClient } from "@/lib/supabase/admin"
import { ROOT_DOMAIN } from "@/lib/url"
import { dnsRecords, normalizeDomain, type DnsRecord } from "./fields"

const API = "https://api.vercel.com"
const project = () => process.env.VERCEL_PROJECT_ID ?? ""
export const domainsReady = () => !!(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID)

async function vercel<T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string> }) {
  const url = new URL(API + path)
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID)
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } }
  return { ok: res.ok, status: res.status, json }
}

type ProjectDomain = { name: string; apexName: string; verified: boolean; verification?: { type: string; domain: string; value: string }[] }
type Config = { misconfigured: boolean; configuredBy: string | null; recommendedCNAME: { rank: number; value: string }[]; recommendedIPv4: { rank: number; value: string[] }[] }

export type DomainRow = { id: string; domain: string; status: "pending" | "active"; records: DnsRecord[]; problem: string | null; checked_at: string | null; active_at: string | null }
export const DOMAIN_COLS = "id, domain, status, records, problem, checked_at, active_at"
const db = () => createAdminClient()

/** The org's domain, if any. */
export async function orgDomain(orgId: string) {
  const { data } = await db().from("org_domains").select(DOMAIN_COLS).eq("org_id", orgId).maybeSingle()
  return data as DomainRow | null
}

/** Adds the domain at Vercel and stores it (pending). Throws message keys (domains.*). */
export async function connectDomain(orgId: string, input: string) {
  if (!domainsReady()) throw new Error("domains.notConfigured")
  const domain = normalizeDomain(input, [ROOT_DOMAIN.replace(/:\d+$/, "")])
  if (!domain) throw new Error("domains.invalid")
  if (await orgDomain(orgId)) throw new Error("domains.onlyOne")
  const { data: taken } = await db().from("org_domains").select("id").eq("domain", domain).maybeSingle()
  if (taken) throw new Error("domains.taken")
  const added = await vercel<ProjectDomain>(`/v10/projects/${project()}/domains`, { method: "POST", body: { name: domain } })
  // Already on this project (e.g. a half-finished earlier attempt) is fine; anything else isn't ours to use.
  if (!added.ok && !(added.status === 400 && /already/i.test(added.json.error?.message ?? ""))) {
    console.error("vercel add domain", added.status, added.json.error)
    throw new Error(added.status === 409 ? "domains.takenElsewhere" : added.status === 400 ? "domains.invalid" : "domains.failed")
  }
  const { error } = await db().from("org_domains").insert({ org_id: orgId, domain })
  if (error) {
    await vercel(`/v9/projects/${project()}/domains/${domain}`, { method: "DELETE" })
    throw new Error(error.code === "23505" ? "domains.taken" : "domains.failed")
  }
  return checkDomain(orgId)
}

/**
 * Asks Vercel how far the domain is: verified for the project (TXT check if it was used elsewhere) and resolving to us
 * with a certificate → active. Stores the records to enter and a short problem. Safe to call often.
 */
export async function checkDomain(orgId: string) {
  const row = await orgDomain(orgId)
  if (!row || !domainsReady()) return row
  const base = `/v9/projects/${project()}/domains/${row.domain}`
  let pd = await vercel<ProjectDomain>(base)
  if (pd.ok && !pd.json.verified) pd = (await vercel<ProjectDomain>(`${base}/verify`, { method: "POST" })).ok ? await vercel<ProjectDomain>(base) : pd
  const config = await vercel<Config>(`/v6/domains/${row.domain}/config`, { query: { projectIdOrName: project() } })
  const apex = pd.json.apexName ?? row.domain
  const records = dnsRecords(row.domain, apex, config.ok ? config.json : null, pd.json.verified ? [] : pd.json.verification)
  const live = pd.ok && pd.json.verified && config.ok && !config.json.misconfigured
  const problem = live ? null : !pd.ok ? "removed" : !pd.json.verified ? "verify" : !config.ok ? "unknown" : config.json.configuredBy ? "certificate" : "dns"
  const now = new Date().toISOString()
  const becameLive = live && row.status !== "active"
  const { data } = await db()
    .from("org_domains")
    .update({ status: live ? "active" : "pending", records, problem, checked_at: now, ...(becameLive && { active_at: now }) })
    .eq("id", row.id)
    .select(DOMAIN_COLS)
    .single()
  if (becameLive) await db().rpc("emit_event", { p_org: orgId, p_type: "domain.connected", p_payload: { domain: row.domain }, p_subject_table: "org_domains", p_subject_id: row.id })
  return data as DomainRow
}

/** Removes the domain from Vercel and roots; the public pages stay on the roots address. */
export async function removeDomain(orgId: string) {
  const row = await orgDomain(orgId)
  if (!row) return false
  if (domainsReady()) {
    const res = await vercel(`/v9/projects/${project()}/domains/${row.domain}`, { method: "DELETE" })
    if (!res.ok && res.status !== 404) throw new Error("domains.failed")
  }
  await db().from("org_domains").delete().eq("id", row.id)
  return true
}

/** Minute worker: pending domains get checked every few minutes until they're live (DNS can take hours). */
export async function checkPendingDomains() {
  if (!domainsReady()) return 0
  const { data } = await db()
    .from("org_domains")
    .select("org_id")
    .eq("status", "pending")
    .or(`checked_at.is.null,checked_at.lt.${new Date(Date.now() - 5 * 60_000).toISOString()}`)
    .order("checked_at", { nullsFirst: true })
    .limit(10)
  for (const d of data ?? []) await checkDomain(d.org_id).catch((e) => console.error("domain check", d.org_id, e))
  return data?.length ?? 0
}
