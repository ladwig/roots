import Link from "next/link"
import { buildTree, type Node, type PageRow } from "@/wiki/tree"

// The page tree (left column): every page, the current one highlighted.
export function TreeNav({ rows, current, label }: { rows: PageRow[]; current?: string; label: string }) {
  const level = (nodes: Node[], depth: number) => (
    <ul className={depth ? "ml-3 grid gap-0.5 border-l pl-2" : "grid gap-0.5"}>
      {nodes.map((n) => (
        <li key={n.id} className="grid gap-0.5">
          <Link
            href={`/wiki/${n.id}`}
            aria-current={n.id === current ? "page" : undefined}
            className="truncate rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {n.title}
          </Link>
          {n.children.length > 0 && level(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  )
  return (
    <nav aria-label={label} className="min-w-0">
      {level(buildTree(rows), 0)}
    </nav>
  )
}
