// CSV import helpers (browser + server). German Excel writes ";" and often Windows-1252, so both are handled.

// Bytes → text: UTF-8 (BOM stripped), else Windows-1252.
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "")
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

// Text → rows of cells. Delimiter = whichever of ; , tab is most common in the first line. Quotes per RFC 4180.
export function parseCsv(text: string): string[][] {
  const first = text.slice(0, text.search(/\r?\n|$/))
  const delim = [";", ",", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ""
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === "") quoted = true
    else if (c === delim) endCell()
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      endCell()
      rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== "" || row.length) {
    endCell()
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "")

export type ImportField = { key: string; label: string; aliases?: string[] }

// Header → field key, by key, label or alias (case/space/umlaut-insensitive). Each field is used once.
export function guessMapping(headers: string[], fields: ImportField[]): (string | null)[] {
  const used = new Set<string>()
  return headers.map((h) => {
    const n = norm(h)
    const f = fields.find((f) => !used.has(f.key) && [f.key, f.label, ...(f.aliases ?? [])].some((a) => norm(a) === n))
    if (!f) return null
    used.add(f.key)
    return f.key
  })
}
