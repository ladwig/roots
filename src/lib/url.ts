import { redirect } from "next/navigation"

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"

export type SearchParams = Record<string, string | string[] | undefined>
export const param = (sp: SearchParams, key: string) => {
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

// Only same-site relative paths, so ?next= can't send people elsewhere.
export const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/"

// Server actions report results through the URL (?error= / ?ok=), like every other piece of UI state.
export function back(path: string, result: { error?: string; ok?: string }): never {
  const url = new URL(path, "http://x")
  url.searchParams.delete("error")
  url.searchParams.delete("ok")
  for (const [k, v] of Object.entries(result)) if (v) url.searchParams.set(k, v)
  redirect(url.pathname + url.search)
}

// Current search params with changes applied (undefined removes a key), as "?…" for links.
export function withParams(sp: SearchParams, changes: Record<string, string | undefined>) {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && !["error", "ok"].includes(k)) next.set(k, v)
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) next.delete(k)
    else next.set(k, v)
  }
  return next.size ? `?${next}` : "?"
}

export const pageParam = (sp: SearchParams) => Math.max(1, Number(param(sp, "page")) || 1)

// Public pages live on <slug>.ROOT_DOMAIN. Hosts without wildcard subdomains (*.vercel.app) use paths instead:
// APP_URL/s/<slug>/… (the /s/[site] routes are reachable directly too).
export const SITE_PATHS = ROOT_DOMAIN.endsWith(".vercel.app")
export const siteUrl = (orgSlug: string, path = "") =>
  SITE_PATHS ? `${APP_URL}/s/${orgSlug}${path}` : `${new URL(APP_URL).protocol}//${orgSlug}.${ROOT_DOMAIN}${path}`
// Links between public pages of one org (relative on its subdomain, /s/<slug>/… in path mode).
export const sitePath = (orgSlug: string, path = "/") => (SITE_PATHS ? `/s/${orgSlug}${path === "/" ? "" : path}` : path)
