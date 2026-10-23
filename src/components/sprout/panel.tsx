"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import type { UIMessage } from "ai"
import { HistoryIcon, Maximize2Icon, Minimize2Icon, PlusIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { deleteChat, loadChat, sproutSetup, starChat } from "@/assistant/actions"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { ChatView, type Model } from "./chat"
import { useSprout } from "./context"
import { SproutOrb } from "./sprout-orb"

type Setup = Awaited<ReturnType<typeof sproutSetup>>
type Chat = { id: string; messages: UIMessage[]; title: string; starred: boolean; saved: boolean; prompt?: string }
const fresh = (): Chat => ({ id: crypto.randomUUID(), messages: [], title: "", starred: false, saved: false })
const MODEL_KEY = "sprout_model"
const store = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(k, v)
    else localStorage.removeItem(k)
  } catch {}
}
const readModel = () => {
  try {
    return localStorage.getItem(MODEL_KEY) ?? ""
  } catch {
    return ""
  }
}

/**
 * Sprout: the assistant as a right-hand panel next to the page (a sheet over the page on phones). It lives in the App
 * layout, so it stays open and keeps its conversation while the person moves between pages. Setup (models of the
 * person's keys, recent chats) loads when the panel opens.
 */
export function SproutPanel({ orgId }: { orgId: string }) {
  const t = useT()
  // The chat that was open, per org: switching orgs never continues another org's chat.
  const CHAT_KEY = `sprout_chat:${orgId}`
  const { open, wide, setOpen, setWide } = useSprout()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [chat, setChat] = useState<Chat>(fresh)
  const [model, setModelState] = useState("")
  const [, start] = useTransition()

  const refresh = useCallback(() => start(async () => setSetup(await sproutSetup())), [])
  // First open: setup, and the chat that was open before a reload (this browser).
  useEffect(() => {
    if (!open || setup) return
    refresh()
    let last: string | null = null
    try {
      last = localStorage.getItem(CHAT_KEY)
    } catch {}
    if (last)
      start(async () => {
        const c = await loadChat(last)
        if (c) setChat({ id: c.id, messages: c.messages, title: c.title, starred: c.starred, saved: true })
      })
  }, [open, setup, refresh, CHAT_KEY])
  // A question from elsewhere (home page): open the panel, new chat, send it there.
  useEffect(() => {
    const on = (e: Event) => {
      setChat({ ...fresh(), prompt: (e as CustomEvent<string>).detail })
      store(CHAT_KEY, null)
      setOpen(true)
    }
    window.addEventListener("sprout:ask", on)
    return () => window.removeEventListener("sprout:ask", on)
  }, [setOpen, CHAT_KEY])
  // Keys added or removed elsewhere (profile page) → reload the models.
  useEffect(() => {
    const on = () => refresh()
    window.addEventListener("sprout:refresh", on)
    return () => window.removeEventListener("sprout:refresh", on)
  }, [refresh])
  // The model: last used (this browser), else the first one the keys offer.
  const models: Model[] = setup?.models ?? []
  const has = (m: string) => models.some((x) => `${x.provider}:${x.id}` === m)
  const chosen = has(model) ? model : has(readModel()) ? readModel() : models[0] ? `${models[0].provider}:${models[0].id}` : ""
  const setModel = (m: string) => {
    setModelState(m)
    try {
      localStorage.setItem(MODEL_KEY, m)
    } catch {}
  }

  const openChat = (id: string) =>
    start(async () => {
      const c = await loadChat(id)
      if (c) setChat({ id: c.id, messages: c.messages, title: c.title, starred: c.starred, saved: true })
      if (c) store(CHAT_KEY, c.id)
      if (c?.model && has(c.model)) setModelState(c.model)
    })
  const title = chat.title || setup?.chats.find((c) => c.id === chat.id)?.title || t("sprout.name")

  if (!open) return null
  return (
    <aside id="sprout-panel" aria-label={t("sprout.name")} className={cn("fixed inset-0 z-40 flex flex-col bg-background", !wide && "md:sticky md:top-0 md:z-auto md:h-svh md:w-[26rem] md:shrink-0 md:border-l")}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <SproutOrb size={22} still className="text-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
        {chat.saved && (
          <Icon
            label={chat.starred ? t("sprout.unstar") : t("sprout.star")}
            onClick={() => {
              setChat((c) => ({ ...c, starred: !c.starred }))
              start(async () => (await starChat(chat.id, !chat.starred), refresh()))
            }}
          >
            <StarIcon className={cn(chat.starred && "fill-current text-primary")} />
          </Icon>
        )}
        <Icon label={t("sprout.newChat")} onClick={() => (setChat(fresh()), store(CHAT_KEY, null))}>
          <PlusIcon />
        </Icon>
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("sprout.history")} title={t("sprout.history")} />}>
            <HistoryIcon />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t("sprout.recent")}</p>
            {!setup?.chats.length && <p className="px-2 py-2 text-sm text-muted-foreground">{t("sprout.noChats")}</p>}
            <ul className="max-h-80 overflow-y-auto">
              {setup?.chats.map((c) => (
                <li key={c.id} className="group flex items-center gap-1 rounded-md hover:bg-muted">
                  <button type="button" onClick={() => openChat(c.id)} className={cn("flex min-h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm", c.id === chat.id && "font-medium")}>
                    {c.starred && <StarIcon className="size-3 shrink-0 fill-current text-primary" />}
                    <span className="truncate">{c.title || t("sprout.untitled")}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.date(c.updated_at, { dateStyle: "short" })}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("sprout.deleteChat")}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() =>
                      start(async () => {
                        await deleteChat(c.id)
                        if (c.id === chat.id) setChat(fresh())
                        refresh()
                      })
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Icon label={wide ? t("sprout.narrow") : t("sprout.wide")} onClick={() => setWide(!wide)} className="max-md:hidden">
          {wide ? <Minimize2Icon /> : <Maximize2Icon />}
        </Icon>
        <Icon label={t("common.close")} onClick={() => setOpen(false)}>
          <XIcon />
        </Icon>
      </header>

      {!setup ? (
        <div className="flex-1" />
      ) : setup.aiOff ? (
        <p className="m-4 text-sm text-muted-foreground">{t("sprout.aiOff")}</p>
      ) : !models.length ? (
        <div className="m-4 grid gap-3 text-sm">
          <p>{t("sprout.needKey")}</p>
          <Button size="sm" className="justify-self-start" render={<Link href="/settings/profile#ai" />} nativeButton={false}>
            {t("sprout.addKeyLink")}
          </Button>
        </div>
      ) : (
        <ChatView
          key={chat.id}
          chatId={chat.id}
          initial={chat.messages}
          prompt={chat.prompt}
          models={models}
          model={chosen}
          setModel={setModel}
          orgId={setup.orgId}
          orgName={setup.orgName}
          onSent={() => {
            setChat((c) => ({ ...c, saved: true }))
            store(CHAT_KEY, chat.id)
            refresh()
          }}
        />
      )}
    </aside>
  )
}

function Icon({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className={className} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
