"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { searchApp, type SearchGroup } from "@/search/actions"
import { addLinkAction } from "./actions"

// ⌘K search groups → the record kind a project can link to.
const KINDS: Record<string, string> = { wiki: "wiki_pages", events: "events", contacts: "contacts", invoices: "documents", forms: "forms", rentals: "rental_objects" }

/** Search any linkable record (wiki page, event, contact …) with the global search and link it to the project. */
export function LinkPicker({ projectId }: { projectId: string }) {
  const t = useT()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [searching, search] = useTransition()
  const [adding, add] = useTransition()

  useEffect(() => {
    const term = q.trim()
    const timer = setTimeout(() => search(async () => setGroups(term.length < 2 ? [] : (await searchApp(term)).filter((g) => KINDS[g.key]))), 250)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("projects.linkSearch")} aria-label={t("projects.linkSearch")} className="h-8 pr-8 text-sm" />
        {searching && <Loader2Icon className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" />}
      </div>
      {groups.map((g) => (
        <div key={g.key} className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">{g.label}</span>
          {g.items.map((i) => (
            <button
              key={i.id}
              type="button"
              disabled={adding}
              onClick={() =>
                add(async () => {
                  const r = await addLinkAction({ projectId, entity: KINDS[g.key], entityId: i.id })
                  if (r.error) toast.error(r.error)
                  else {
                    setQ("")
                    router.refresh()
                  }
                })
              }
              className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              {i.detail && <span className="truncate text-xs text-muted-foreground">{i.detail}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
