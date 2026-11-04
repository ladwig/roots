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

/** The part of a form control restoreFields() touches (inputs, textareas, selects from form.elements). */
export type Field = { name: string; type: string; disabled: boolean; value: string; checked?: boolean; options?: ArrayLike<{ value: string; selected: boolean }> }
const SKIP = new Set(["hidden", "file", "password", "submit", "button", "reset", "image", "fieldset", "output", "object"])

// Puts sent values back into the visible fields; files and passwords are never restored. Hidden inputs belong to
// components (dates, tags, rich text, pickers) and are left alone: they keep their state while the page stays mounted.
// shortcut: after a remount (path mode, back() to the unprefixed path) those components start from the server again, so
// typed dates/tags/rich text are lost; fix back() to keep the /app prefix (no remount) when that matters.
export function restoreFields(fields: Iterable<Field>, snap: Snapshot) {
  const used = new Map<string, number>()
  for (const el of fields) {
    if (!el.name || el.disabled || SKIP.has(el.type)) continue
    const values = snap.get(el.name)
    // Unticked boxes aren't sent at all: a missing name means none of them was ticked.
    if (el.type === "checkbox" || el.type === "radio") el.checked = (values ?? []).includes(el.value)
    else if (!values) continue
    else if (el.type === "select-multiple") for (const o of Array.from(el.options ?? [])) o.selected = values.includes(o.value)
    else {
      const i = used.get(el.name) ?? 0
      el.value = values[i] ?? ""
      used.set(el.name, i + 1)
    }
  }
}
