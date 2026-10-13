"use server"

import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { isMemberCode, memberDoor, memberDoorList, type MemberAtDoor } from "@/members/door"

export type ScanResult = { result: "ok" | "used" | "invalid" | "error"; holder?: string | null; type?: string | null; at?: string | null; message?: string; member?: MemberAtDoor }

// Called by the scanner page for every code (camera or typed).
export async function checkIn(eventId: string, code: string): Promise<ScanResult> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const clean = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !clean) return { result: "invalid" }
  const members = ctx.modules.has("members")
  const member = async (): Promise<ScanResult> => {
    // A member card or number: show who it is; letting in is a second step (admitMember).
    try {
      const m = await memberDoor(ctx.supabase, eventId, { code: clean }, false)
      return m.result === "invalid" ? { result: "invalid" } : { result: "ok", member: m }
    } catch (e) {
      return { result: "error", message: (e as { message?: string }).message === "not_allowed" ? t("errors.not_allowed") : t("tickets.scanFailed") }
    }
  }
  if (members && isMemberCode(clean)) return member()
  const { data, error } = await ctx.supabase.rpc("check_in_ticket", { p_event: eventId, p_code: clean }).maybeSingle()
  if (error || !data) return { result: "error", message: error?.message === "not_allowed" ? t("errors.not_allowed") : t("tickets.scanFailed") }
  if (data.result === "invalid" && members) return member()
  return { result: data.result as ScanResult["result"], holder: data.holder_name, type: data.type_name, at: data.checked_in_at }
}

/** Let a looked-up member in (scanner card button). */
export async function admitMember(eventId: string, contactId: string): Promise<MemberAtDoor | { result: "error"; message: string }> {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !/^[0-9a-f-]{36}$/.test(contactId)) return { result: "invalid" }
  try {
    return await memberDoor(ctx.supabase, eventId, { contactId }, true)
  } catch {
    return { result: "error", message: t("tickets.scanFailed") }
  }
}

// Offline: the members for the device (when the members module is on).
export async function scanMembers(eventId: string): Promise<MemberAtDoor[]> {
  const ctx = await requirePerm("tickets.scan")
  if (!ctx.modules.has("members") || !/^[0-9a-f-]{36}$/.test(eventId)) return []
  return memberDoorList(ctx.supabase, eventId)
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

// Offline check-ins, sent when the device is back online ("member:<contact id>" = a member let in).
// "conflict" = someone else let this ticket/member in already.
export async function syncCheckIns(eventId: string, codes: string[]): Promise<{ synced: number; conflicts: string[] }> {
  let synced = 0
  const conflicts: string[] = []
  for (const code of codes.slice(0, 2000)) {
    if (code.startsWith("member:")) {
      const m = await admitMember(eventId, code.slice(7))
      if (m.result === "ok") synced++
      else if (m.result === "error") throw new Error(m.message)
      else conflicts.push(m.name ?? code)
      continue
    }
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

// Door → Mitglieder tab (search by name): look up = link, let in = this form.
export async function memberDoorCheckIn(fd: FormData) {
  const ctx = await requirePerm("tickets.scan")
  const t = await getT()
  const event = String(fd.get("event") ?? "")
  const contact = String(fd.get("contact") ?? "")
  const here = `/scan?${new URLSearchParams({ event, tab: "members", q: String(fd.get("q") ?? ""), who: contact })}`
  if (!/^[0-9a-f-]{36}$/.test(event) || !/^[0-9a-f-]{36}$/.test(contact)) back(here, { error: t("errors.invalid_input") })
  let r: MemberAtDoor
  try {
    r = await memberDoor(ctx.supabase, event, { contactId: contact }, true)
  } catch (e) {
    back(here, { error: dbError(t, e as { message: string }) })
  }
  if (r!.result === "ok") back(here, { ok: t("door.checkedIn", { name: r!.name ?? "" }) })
  back(here, { error: t.dynamic(`door.member.${r!.result}`) })
}
