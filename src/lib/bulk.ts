// Server side of the bulk bar (<BulkBar>): the ticked row ids and the usual "move them all to the trash".
import type { getContext } from "@/lib/context"

type Ctx = Awaited<ReturnType<typeof getContext>>

/** Ticked ids from a bulk form (uuids only, deduplicated, at most 500). */
export const pickedIds = (fd: FormData) => [...new Set(fd.getAll("ids").map(String))].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 500)

/** Soft-deletes each id (permission checked in the DB per row); the first error, if any. */
export async function trashMany(ctx: Ctx, table: string, ids: string[]) {
  const results = await Promise.all(ids.map((id) => ctx.supabase.rpc("soft_delete", { p_table: table, p_id: id })))
  return results.find((r) => r.error)?.error ?? null
}
