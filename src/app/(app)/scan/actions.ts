"use server"

import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"

export type ScanResult = { result: "ok" | "used" | "invalid" | "error"; holder?: string | null; type?: string | null; at?: string | null; message?: string }

// Called by the scanner page for every code (camera or typed).
export async function checkIn(eventId: string, code: string): Promise<ScanResult> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !clean) return { result: "invalid" }
  const { data, error } = await ctx.supabase.rpc("check_in_ticket", { p_event: eventId, p_code: clean }).maybeSingle()
  if (error || !data) return { result: "error", message: error?.message === "not_allowed" ? t("errors.not_allowed") : t("tickets.scanFailed") }
  return { result: data.result as ScanResult["result"], holder: data.holder_name, type: data.type_name, at: data.checked_in_at }
}
