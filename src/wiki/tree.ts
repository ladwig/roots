// Wiki page tree: flat rows → nested, path to a page. Pure (node --test).
export type PageRow = { id: string; parent_id: string | null; title: string; position: number }
export type Node = PageRow & { children: Node[] }

/** Nested by parent; pages whose parent isn't there (deleted, no access) become top-level. Sorted by position, title. */
export function buildTree(rows: PageRow[]): Node[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as Node[] }]))
  const roots: Node[] = []
  for (const n of byId.values()) (n.parent_id && byId.has(n.parent_id) ? byId.get(n.parent_id)!.children : roots).push(n)
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "de"))
    list.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

/** Ancestors of a page, top first (without the page). */
export function pathTo(rows: PageRow[], id: string): PageRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: PageRow[] = []
  for (let p = byId.get(id)?.parent_id; p && byId.has(p) && out.length < 50; p = byId.get(p)!.parent_id) out.unshift(byId.get(p)!)
  return out
}

/** The page and everything below it (a page can't move into these). */
export function subtree(rows: PageRow[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const r of rows)
      if (r.parent_id && out.has(r.parent_id) && !out.has(r.id)) {
        out.add(r.id)
        grew = true
      }
  }
  return out
}
