// What a form held when it was submitted, so <SaveBar> can put it back after the server answered with ?error=.

export type Snapshot = Map<string, string[]>

/** Text values by field name, in order (checkbox groups and repeated names keep every value). Files are dropped. */
export function fieldValues(entries: Iterable<[string, unknown]>): Snapshot {
  const snap: Snapshot = new Map()
  for (const [name, value] of entries) {
    if (typeof value !== "string") continue
    snap.set(name, [...(snap.get(name) ?? []), value])
  }
  return snap
}

/** back(path, { error }) put the error into the URL: the submit failed. */
export const failedSubmit = (search: string) => new URLSearchParams(search).has("error")

/** A submit as kept in sessionStorage: the redirect remounts the page, so memory doesn't survive it. */
export type Sent = { path: string; form: number; at: number; values: [string, string[]][] }

/** The values to put back into this form, or null: same page and form, failed, at most 30 s old. */
export function toRestore(sent: Sent | null, here: { path: string; form: number; search: string; now: number }): Snapshot | null {
  if (!sent || sent.path !== here.path || sent.form !== here.form || here.now - sent.at > 30_000) return null
  return failedSubmit(here.search) ? new Map(sent.values) : null
}

/** After a SaveBar looked at it: keep the snapshot only while another form of this failed page may still need it. */
export function keepSent(sent: Sent | null, here: { path: string; form: number; search: string; now: number }): boolean {
  return !!sent && sent.path === here.path && sent.form !== here.form && here.now - sent.at <= 30_000 && failedSubmit(here.search)
}
