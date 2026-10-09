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
