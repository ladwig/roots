"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { SmilePlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"
import { setIconAction } from "../actions"

// A choice of common page icons; any other emoji can be typed or pasted (or picked with the system emoji keyboard).
const EMOJIS = "📄 📝 📌 📎 📚 📖 📒 📋 ✅ ☑️ ⭐ 💡 🔥 🎉 🎶 🎧 🎤 🎸 🥁 🎟️ 🍻 🍸 ☕ 🍕 🏠 🏢 🗺️ 📍 🗓️ ⏰ 💶 💳 🧾 📈 📊 🛠️ 🔧 🔑 🔒 ⚠️ ❓ ℹ️ 👋 🤝 👥 🧑‍🤝‍🧑 💬 📣 ✉️ 📞 🌱 🌍 ☀️ 🌙 ❤️ 💚 🖤 🚀 🎨 📷 🎬 🏃 ⚽ 🧘 🛡️ ⚖️ 🗳️".split(" ")

export function IconPicker({ pageId, icon }: { pageId: string; icon: string | null }) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(icon)
  const [pending, start] = useTransition()
  const pick = (next: string | null) =>
    start(async () => {
      const r = await setIconAction({ id: pageId, icon: next })
      if (r.error) return void toast.error(r.error)
      setValue(next)
      setOpen(false)
      router.refresh() // tree + other places
    })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          value ? (
            <button type="button" className="justify-self-start rounded-lg px-1 text-5xl leading-none hover:bg-muted" aria-label={t("wiki.icon.change")} />
          ) : (
            <Button type="button" size="sm" variant="ghost" className="justify-self-start text-muted-foreground" />
          )
        }
      >
        {value ?? (
          <>
            <SmilePlusIcon /> {t("wiki.icon.add")}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3">
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((e) => (
            <button key={e} type="button" disabled={pending} onClick={() => pick(e)} className="rounded-md p-1 text-xl hover:bg-muted" aria-label={e}>
              {e}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = String(new FormData(e.currentTarget).get("emoji") ?? "").trim()
            if (v) pick(v)
          }}
        >
          <Input name="emoji" maxLength={16} placeholder={t("wiki.icon.own")} aria-label={t("wiki.icon.own")} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {t("wiki.icon.set")}
          </Button>
        </form>
        {value && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => pick(null)} className="justify-self-start">
            {t("wiki.icon.remove")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
