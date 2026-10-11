// "Sommerfest 2026 – Übermorgen!" → "sommerfest-2026-uebermorgen". Always matches the DB check (2–80 chars).
export function slugify(title: string) {
  const s = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "")
  return s.length >= 2 ? s : `event-${s || crypto.randomUUID().slice(0, 4)}`
}
