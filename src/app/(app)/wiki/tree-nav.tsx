"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { GlobeIcon, IdCardIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { buildTree, effectiveVisibility, subtree, type Node, type PageRow } from "@/wiki/tree"
import { movePageAction } from "./actions"

type Drop = { id: string; zone: "before" | "inside" } | { id: "root"; zone: "inside" }

// The page tree (left column), current page highlighted. Writers drag pages: onto a page = put it inside,
// onto the upper edge = put it before, onto the area below the tree = top level at the end.
export function TreeNav({ rows, current, label, movable }: { rows: PageRow[]; current?: string; label: string; movable?: boolean }) {
  const t = useT()
  const router = useRouter()
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<Drop | null>(null)
  const [pending, start] = useTransition()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const blocked = dragged ? subtree(rows, dragged) : new Set<string>()

  const move = (to: Drop) => {
    const id = dragged
    setDragged(null)
    setOver(null)
    if (!id || (to.id !== "root" && blocked.has(to.id))) return
    const target = to.id === "root" ? null : byId.get(to.id)!
    const parentId = to.id === "root" ? null : to.zone === "inside" ? target!.id : target!.parent_id
    const beforeId = to.zone === "before" && target ? target.id : null
    start(async () => {
      const r = await movePageAction({ id, parentId, beforeId })
      if (r.error) toast.error(r.error)
      router.refresh()
    })
  }
  const dragProps = (n: Node) =>
    movable
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move"
            setDragged(n.id)
          },
          onDragEnd: () => (setDragged(null), setOver(null)),
          onDragOver: (e: React.DragEvent) => {
            if (!dragged || blocked.has(n.id)) return
            e.preventDefault()
            const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setOver({ id: n.id, zone: e.clientY - box.top < box.height * 0.3 ? "before" : "inside" })
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            if (over && over.id === n.id) move(over)
          },
        }
      : {}

  const level = (nodes: Node[], depth: number) => (
    <ul className={depth ? "ml-3 grid gap-0.5 border-l pl-2" : "grid gap-0.5"}>
      {nodes.map((n) => (
        <li key={n.id} className="grid gap-0.5">
          <Link
            href={`/wiki/${n.id}`}
            aria-current={n.id === current ? "page" : undefined}
            {...dragProps(n)}
            className={cn(
              "truncate rounded-md border-t-2 border-transparent px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground",
              dragged === n.id && "opacity-50",
              over?.id === n.id && over.zone === "before" && "border-t-primary",
              over?.id === n.id && over.zone === "inside" && "bg-primary/10 text-foreground",
            )}
          >
            {(() => {
              const v = effectiveVisibility(rows, n.id).visibility
              const I = v === "roles" ? LockIcon : v === "members" ? IdCardIcon : v === "public" ? GlobeIcon : null
              return I && <I className="mr-1 inline size-3 align-[-1px]" aria-label={t.dynamic(`wiki.share.short.${v}`)} />
            })()}
            {n.icon && <span className="mr-1">{n.icon}</span>}
            {n.title}
          </Link>
          {n.children.length > 0 && level(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  )
  return (
    <nav aria-label={label} className={cn("grid min-w-0 gap-1", pending && "opacity-60")}>
      {level(buildTree(rows), 0)}
      {movable && dragged && (
        <div
          onDragOver={(e) => (e.preventDefault(), setOver({ id: "root", zone: "inside" }))}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => (e.preventDefault(), move({ id: "root", zone: "inside" }))}
          className={cn("rounded-md border border-dashed px-2 py-2 text-center text-xs text-muted-foreground", over?.id === "root" && "border-primary bg-primary/10")}
        >
          {t("wiki.dropTopLevel")}
        </div>
      )}
    </nav>
  )
}
