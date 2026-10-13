// Member check-in at the door (member_door() in the DB): look up by card code, member number or contact id, then let in = a used,
// free ticket of the event's member ticket type. Shared by the scanner, the door's member tab and the API.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type MemberAtDoor = {
  result: "invalid" | "not_member" | "member" | "ok" | "already"
  contact_id?: string
  code?: string | null
  number?: string | null // member number without separators, for matching
  full?: boolean // event capacity reached: the door decides
  name?: string | null
  membership_id?: string | null
  member_no?: string | null
  type?: string | null
  state?: "none" | "upcoming" | "ended" | "active"
  ends_on?: string | null
  paused?: boolean
  paused_until?: string | null
  overdue_count?: number
  overdue_cents?: number
  visits?: number
  last_visit?: string | null
  checked_in_at?: string | null
}

/** Member codes are 12 characters (ticket codes 10), same alphabet. */
export const isMemberCode = (code: string) => /^[A-HJ-NP-Z2-9]{12}$/.test(code)

export async function memberDoor(db: SupabaseClient<Database>, eventId: string, who: { code?: string; contactId?: string }, admit: boolean) {
  const { data, error } = await db.rpc("member_door", { p_event: eventId, p_code: who.code ?? "", p_contact: who.contactId, p_admit: admit })
  if (error) throw error
  return data as unknown as MemberAtDoor
}

/** Every member with what the door sees, for scanners that check offline. */
export async function memberDoorList(db: SupabaseClient<Database>, eventId: string) {
  const { data, error } = await db.rpc("member_door_list", { p_event: eventId })
  if (error) throw error
  return (data ?? []) as unknown as MemberAtDoor[]
}
