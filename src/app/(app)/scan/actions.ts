"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"

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

export type ScanEntry = { code: string; status: "valid" | "used"; holder: string | null; type: string | null }

// Offline: the event's valid/used tickets for the device (staff with tickets.scan only).
export async function scanList(eventId: string): Promise<ScanEntry[]> {
  const ctx = await requirePerm("tickets.scan")
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return []
  const out: ScanEntry[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await ctx.supabase
      .from("tickets")
      .select("code, status, holder_name, ticket_types(name)")
      .eq("event_id", eventId)
      .in("status", ["valid", "used"])
      .order("id")
      .range(from, from + 999)
    data?.forEach((k) => out.push({ code: k.code, status: k.status as ScanEntry["status"], holder: k.holder_name, type: k.ticket_types?.name ?? null }))
    if (!data || data.length < 1000) return out
  }
}

// Offline check-ins, sent when the device is back online. "conflict" = someone else let this ticket in already.
export async function syncCheckIns(eventId: string, codes: string[]): Promise<{ synced: number; conflicts: string[] }> {
  let synced = 0
  const conflicts: string[] = []
  for (const code of codes.slice(0, 2000)) {
    const r = await checkIn(eventId, code)
    if (r.result === "ok") synced++
    else if (r.result === "error") throw new Error(r.message)
    else conflicts.push(code)
  }
  return { synced, conflicts }
}

// Door lists (forms on the Gäste/Tickets tabs): check in a guest-list entry, or a ticket by code.
export async function guestCheckIn(fd: FormData) {
  const ctx = await requirePerm("guestlists.checkin")
  const t = await getT()
  const event = String(fd.get("event") ?? "")
  const entry = String(fd.get("entry") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: "guests", q: String(fd.get("q") ?? ""), list: String(fd.get("list") ?? "") })}`
  if (fd.get("undo") === "1") {
    const { error } = await ctx.supabase.from("guest_checkins").delete().eq("entry_id", entry).eq("event_id", event).eq("org_id", ctx.org.id)
    if (error) back(here, { error: dbError(t, error) })
    back(here, { ok: t("door.undone") })
  }
  const { error } = await ctx.supabase.from("guest_checkins").insert({ org_id: ctx.org.id, entry_id: entry, event_id: event })
  if (error) back(here, { error: error.code === "23505" ? t("door.already") : dbError(t, error) })
  back(here, { ok: t("door.checkedIn", { name: String(fd.get("name") ?? "") }) })
}

export async function ticketDoorCheckIn(fd: FormData) {
  const event = String(fd.get("event") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: "tickets", q: String(fd.get("q") ?? "") })}`
  const t = await getT()
  const r = await checkIn(event, String(fd.get("code") ?? ""))
  if (r.result === "ok") back(here, { ok: t("door.checkedIn", { name: r.holder ?? String(fd.get("code")) }) })
  back(here, { error: r.message ?? t.dynamic(`tickets.scanResult.${r.result}`) })
}
