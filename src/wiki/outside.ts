// Wiki pages outside the team: member area ('members') and public pages ('public'). Public reads go through the
// anonymous client; member reads through the service role *after* the caller checked the member-area session and
// a membership (the DB serves member pages only to the service role).
import { createAdminClient } from "@/lib/supabase/admin"
import { createPublicClient } from "@/lib/supabase/server"
import { getPortalContact } from "@/portal/session"

export type Level = "public" | "members"
export type OutsidePage = { id: string; title: string; body: string; updated_at: string; children: { id: string; title: string }[]; path: { id: string; title: string }[] }
export type OutsideEntry = { id: string; title: string; updated_at: string }

const client = (level: Level) => (level === "public" ? createPublicClient() : createAdminClient())

export async function outsidePage(orgId: string, pageId: string, level: Level) {
  if (!/^[0-9a-f-]{36}$/.test(pageId)) return null
  const { data } = await client(level).rpc("wiki_outside_page", { p_org: orgId, p_page: pageId, p_level: level })
  return (data as OutsidePage | null) ?? null
}

export async function outsideIndex(orgId: string, level: Level) {
  const { data } = await client(level).rpc("wiki_outside_index", { p_org: orgId, p_level: level })
  return (data as OutsideEntry[] | null) ?? []
}

/** The signed-in member of this org's member area (contact with an active membership), or null. */
export async function portalMember(orgId: string) {
  const me = await getPortalContact(orgId)
  if (!me) return null
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const { data } = await createAdminClient()
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", me.contact.id)
    .is("deleted_at", null)
    .lte("starts_on", today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .limit(1)
  return data?.length ? me : null
}

/** Signed URL of a file inside a page released at `level` (null = not released there). */
export async function outsideFileUrl(orgId: string, fileId: string, level: Level) {
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return null
  const db = createAdminClient()
  const { data: path } = await db.rpc("wiki_outside_file", { p_org: orgId, p_file: fileId, p_level: level })
  if (!path) return null
  const { data } = await db.storage.from("files").createSignedUrl(path as string, 300)
  return data?.signedUrl ?? null
}
