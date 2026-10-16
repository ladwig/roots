"use client"

import { useState } from "react"
import { ArrowUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { SproutOrb } from "./sprout-orb"

/** Entry point on the home page: the question opens Sprout's panel and runs there as a new chat. */
export function SproutAsk() {
  const t = useT()
  const [text, setText] = useState("")
  const ask = (q: string) => {
    if (!q.trim()) return
    window.dispatchEvent(new CustomEvent("sprout:ask", { detail: q.trim() }))
    setText("")
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        ask(text)
      }}
      className="grid gap-3 rounded-xl border bg-card p-3 focus-within:ring-2 focus-within:ring-ring/50"
    >
      <div className="flex items-center gap-2">
        <SproutOrb size={36} still className="text-foreground" label="Sprout" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              ask(text)
            }
          }}
          rows={1}
          placeholder={t("sprout.placeholder")}
          aria-label={t("sprout.placeholder")}
          className="min-h-9 w-full resize-none bg-transparent py-1.5 text-sm outline-none field-sizing-content"
        />
        <Button type="submit" size="icon-sm" disabled={!text.trim()} aria-label={t("sprout.send")}>
          <ArrowUpIcon />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["today", "overdue", "event"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant="outline" onClick={() => ask(t.dynamic(`sprout.ideas.${k}`))}>
            {t.dynamic(`sprout.ideas.${k}`)}
          </Button>
        ))}
      </div>
    </form>
  )
}
