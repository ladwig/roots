"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { hashKey } from "@/api/core"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { apiCorePermissions, modules } from "@/modules/registry"

const PATH = "/settings/api"
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
const random = (n: number) => Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("")

// Returns the new key once (never stored in plain text); the form shows it with useActionState.
export async function createApiKey(_: unknown, fd: FormData): Promise<{ key?: string; error?: string }> {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const name = String(fd.get("name") ?? "").trim().slice(0, 100)
  const allowed = new Set([...apiCorePermissions, ...modules.filter((m) => ctx.modules.has(m.key)).flatMap((m) => m.permissions)])
  // A key never gets more than its creator has.
  const permissions = [...new Set(fd.getAll("permissions").map(String))].filter((p) => allowed.has(p) && ctx.can(p))
  if (!name) return { error: t("api.nameMissing") }
  if (!permissions.length) return { error: t("api.permsMissing") }
  // Expiry in days (0 = never). Default in the form: 1 year.
  const days = [0, 30, 90, 365].includes(Number(fd.get("expires"))) ? Number(fd.get("expires")) : 365
  const expires_at = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null
  const prefix = `roots_${random(6)}`
  const key = `${prefix}${random(32)}`
  const { error } = await ctx.supabase.from("api_keys").insert({ org_id: ctx.org.id, name, prefix, key_hash: hashKey(key), permissions, expires_at })
  if (error) return { error: dbError(t, error) }
  revalidatePath(PATH)
  return { key }
}

export async function revokeApiKey(fd: FormData) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const { error, count } = await ctx.supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", String(fd.get("id") ?? ""))
    .eq("org_id", ctx.org.id)
    .is("revoked_at", null)
  if (error || !count) back(PATH, { error: error ? dbError(t, error) : t("errors.not_allowed") })
  back(PATH, { ok: t("api.revoked") })
}

/** Org switch: may members connect AI apps (Claude via MCP) to this org? Off cuts existing connections at once. */
export async function setAllowAi(fd: FormData) {
  const ctx = await requirePerm("org.integrations.manage")
  const t = await getT()
  const on = fd.get("allow_ai") === "on"
  const { error } = await ctx.supabase.from("orgs").update({ allow_ai: on }).eq("id", ctx.org.id)
  revalidatePath(PATH)
  back(PATH, error ? { error: dbError(t, error) } : { ok: on ? t("settings.aiOn") : t("settings.aiOff") })
}
