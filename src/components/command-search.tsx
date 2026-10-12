"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CalendarDaysIcon,
  ClipboardListIcon,
  ContactIcon,
  FileIcon,
  FileTextIcon,
  IdCardIcon,
  LayoutGridIcon,
  Loader2Icon,
  MailIcon,
  ReceiptTextIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useT } from "@/i18n/client"
import { searchApp, type SearchGroup } from "@/search/actions"

const ICONS: Record<string, LucideIcon> = {
  pages: LayoutGridIcon,
  contacts: ContactIcon,
  members: IdCardIcon,
  events: CalendarDaysIcon,
  invoices: ReceiptTextIcon,
  forms: ClipboardListIcon,
  email: MailIcon,
  files: FileIcon,
  templates: FileTextIcon,
}

/** "Suchen ⌘K" in the sidebar: a dialog that searches pages + records of the active org on the server as you type. */
export function CommandSearch() {
  const t = useT()
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [pending, start] = useTransition()
  const latest = useRef("")

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", key)
    return () => document.removeEventListener("keydown", key)
  }, [])

  // Debounced server search; only the answer to the latest query is shown.
  useEffect(() => {
    const term = q.trim()
    latest.current = term
    if (!term) return
    const timer = setTimeout(
      () =>
        start(async () => {
          const res = await searchApp(term)
          if (latest.current === term) setGroups(res)
        }),
      180,
    )
    return () => clearTimeout(timer)
  }, [q])

  const go = (href: string) => {
    setOpen(false)
    setOpenMobile(false)
    setQ("")
    setGroups([])
    router.push(href)
  }
  const shown = q.trim() ? groups : []

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip={`${t("search.open")} (⌘K)`} onClick={() => setOpen(true)} className="text-muted-foreground">
            <SearchIcon />
            <span>{t("search.open")}</span>
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">⌘K</kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("search.open")} description={t("search.hint")}>
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("search.placeholder")} />
          <CommandList>
            {!q.trim() ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("search.hint")}</p>
            ) : pending && !shown.length ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> {t("search.loading")}
              </p>
            ) : (
              <CommandEmpty>{t("search.empty")}</CommandEmpty>
            )}
            {shown.map((g) => {
              const Icon = ICONS[g.key] ?? SearchIcon
              return (
                <CommandGroup key={g.key} heading={g.label}>
                  {g.items.map((it) => (
                    <CommandItem key={`${g.key}-${it.id}`} value={`${g.key}-${it.id}`} onSelect={() => go(it.href)}>
                      <Icon />
                      <span className="truncate">{it.title}</span>
                      {it.detail && <span className="ml-auto truncate text-xs text-muted-foreground">{it.detail}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
