// German / EU date + time text ↔ the values native inputs post ("2026-11-04", "2026-11-04T19:30"), so server code
// stays the same. Pure, node --test. Used by <DateInput>.

const pad = (n: number) => String(n).padStart(2, "0")

/** "4.11.26", "04.11.2026", "4/11/2026", "2026-11-04" → "2026-11-04"; anything else (or an impossible day) → null. */
export function parseDate(text: string): string | null {
  const s = text.trim()
  let d: number, m: number, y: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const eu = /^(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{2}|\d{4})$/.exec(s)
  if (iso) [y, m, d] = [+iso[1], +iso[2], +iso[3]]
  else if (eu) [d, m, y] = [+eu[1], +eu[2], eu[3].length === 2 ? 2000 + +eu[3] : +eu[3]]
  else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** "2026-11-04" → "04.11.2026" ("" stays ""). */
export const formatDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "")

/** "9", "930", "9:5", "19.30", "1930" → "09:00", "09:30", "09:05", "19:30", "19:30" (24 h); invalid → null. */
export function parseTime(text: string): string | null {
  const s = text.trim().replace(/\s*uhr$/i, "")
  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s)
  if (!m) return null
  const h = +m[1]
  const min = m[2] === undefined ? 0 : +m[2]
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}
