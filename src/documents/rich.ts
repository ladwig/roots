// Rich-text HTML (what <RichTextEditor> produces) → blocks of styled text runs, for the PDF renderer. Pure (tested).
// Knows p, h1–h3, strong/b, em/i, ul/ol/li, blockquote, br, hr; links keep their text, everything else is dropped.

export type Run = { text: string; bold?: boolean; italic?: boolean }
export type Block = { kind: "p" | "h2" | "h3" | "li" | "quote" | "hr"; runs: Run[]; marker?: string; depth?: number }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  )

export function htmlBlocks(html: string): Block[] {
  const blocks: Block[] = []
  const lists: { ordered: boolean; n: number }[] = []
  let bold = 0
  let italic = 0
  let quote = 0
  let cur: Block | null = null
  const flush = () => {
    if (cur && cur.runs.some((r) => r.text.trim())) {
      // Trim the block's outer whitespace, keep inner spacing.
      cur.runs[0].text = cur.runs[0].text.replace(/^\s+/, "")
      const last = cur.runs[cur.runs.length - 1]
      last.text = last.text.replace(/\s+$/, "")
      blocks.push(cur)
    }
    cur = null
  }
  const inItem = () => (cur as Block | null)?.kind === "li" // (a closure assigns cur, so TS can't narrow it)
  const open = (kind: Block["kind"], extra: Partial<Block> = {}) => {
    flush()
    cur = { kind: quote && kind === "p" ? "quote" : kind, runs: [], ...extra }
  }

  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*?(\/?)>|([^<]+)/gi)) {
    const [, close, rawTag, , text] = m
    if (text !== undefined) {
      const t = decode(text.replace(/\s+/g, " "))
      if (!t.trim() && !cur) continue
      if (!cur) open("p")
      cur!.runs.push({ text: t, ...(bold && { bold: true }), ...(italic && { italic: true }) })
      continue
    }
    const tag = rawTag.toLowerCase()
    if (tag === "strong" || tag === "b") bold += close ? -1 : 1
    else if (tag === "em" || tag === "i") italic += close ? -1 : 1
    else if (tag === "br") {
      if (!cur) open("p")
      cur!.runs.push({ text: "\n" })
    } else if (tag === "hr") {
      flush()
      blocks.push({ kind: "hr", runs: [] })
    } else if (tag === "ul" || tag === "ol") {
      if (close) lists.pop()
      else lists.push({ ordered: tag === "ol", n: 0 })
      flush()
    } else if (tag === "li") {
      if (close) flush()
      else {
        const list = lists[lists.length - 1] ?? { ordered: false, n: 0 }
        list.n++
        open("li", { marker: list.ordered ? `${list.n}.` : "•", depth: Math.max(0, lists.length - 1) })
      }
    } else if (tag === "blockquote") {
      quote += close ? -1 : 1
      flush()
    } else if (tag === "p" || tag === "div") {
      // A <p> inside an <li> continues the item.
      if (close) {
        if (!inItem()) flush()
      } else if (!inItem()) open("p")
    } else if (/^h[1-6]$/.test(tag)) {
      if (close) flush()
      else open(tag === "h1" || tag === "h2" ? "h2" : "h3")
    }
  }
  flush()
  return blocks
}
