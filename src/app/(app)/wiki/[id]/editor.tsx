"use client"

import { useEffect, useRef, useState } from "react"
import { BoldIcon, CodeIcon, Heading2Icon, ItalicIcon, LinkIcon, ListChecksIcon, ListIcon, ListOrderedIcon, QuoteIcon, TableIcon } from "lucide-react"
import { Markdown } from "@/components/markdown"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { savePageAction } from "../actions"

type Parent = { id: string; label: string }

// Markdown editor: toolbar + shortcuts (⌘B, ⌘I, ⌘K link, ⌘S save), live preview next to it (below on phones).
// Posts like a normal form; warns before leaving with unsaved changes.
export function WikiEditor({ page, parents }: { page: { id: string; title: string; body: string; parent_id: string | null }; parents: Parent[] }) {
  const t = useT()
  const [body, setBody] = useState(page.body)
  const [dirty, setDirty] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Wrap the selection (bold, link …) or prefix the selected lines (lists, headings).
  const edit = (fn: (sel: string) => string, select?: (out: string) => [number, number]) => {
    const el = document.getElementById("w-body") as HTMLTextAreaElement
    const [a, b] = [el.selectionStart, el.selectionEnd]
    const out = fn(body.slice(a, b))
    const next = body.slice(0, a) + out + body.slice(b)
    setBody(next)
    setDirty(true)
    requestAnimationFrame(() => {
      el.focus()
      const [s, e] = select ? select(out) : [out.length, out.length]
      el.setSelectionRange(a + s, a + e)
    })
  }
  const wrap = (mark: string, fallback: string) => edit((s) => `${mark}${s || fallback}${mark}`, (o) => [mark.length, o.length - mark.length])
  const lines = (prefix: string | ((i: number) => string)) =>
    edit((s) => (s || t("wiki.listItem")).split("\n").map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l).join("\n"))
  const tools = [
    { label: t("wiki.tools.bold"), icon: BoldIcon, run: () => wrap("**", t("wiki.tools.bold")) },
    { label: t("wiki.tools.italic"), icon: ItalicIcon, run: () => wrap("_", t("wiki.tools.italic")) },
    { label: t("wiki.tools.heading"), icon: Heading2Icon, run: () => lines("## ") },
    { label: t("wiki.tools.list"), icon: ListIcon, run: () => lines("- ") },
    { label: t("wiki.tools.numbered"), icon: ListOrderedIcon, run: () => lines((i) => `${i + 1}. `) },
    { label: t("wiki.tools.checklist"), icon: ListChecksIcon, run: () => lines("- [ ] ") },
    { label: t("wiki.tools.quote"), icon: QuoteIcon, run: () => lines("> ") },
    { label: t("wiki.tools.link"), icon: LinkIcon, run: () => edit((s) => `[${s || t("wiki.tools.linkText")}](https://)`, (o) => [o.length - 9, o.length - 1]) },
    { label: t("wiki.tools.code"), icon: CodeIcon, run: () => edit((s) => (s.includes("\n") ? `\n\`\`\`\n${s}\n\`\`\`\n` : `\`${s || "code"}\``)) },
    { label: t("wiki.tools.table"), icon: TableIcon, run: () => edit(() => `\n| ${t("wiki.tools.column")} 1 | ${t("wiki.tools.column")} 2 |\n| --- | --- |\n|  |  |\n`) },
  ]
  const keys = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    if (k === "b" || k === "i" || k === "k" || k === "s") e.preventDefault()
    if (k === "b") tools[0].run()
    if (k === "i") tools[1].run()
    if (k === "k") tools[7].run()
    if (k === "s") form.current?.requestSubmit()
  }

  return (
    <form ref={form} action={savePageAction} onSubmit={() => setDirty(false)} className="grid gap-4">
      <input type="hidden" name="id" value={page.id} />
      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <div className="grid gap-2">
          <Label htmlFor="w-title">{t("wiki.pageTitle")}</Label>
          <Input id="w-title" name="title" defaultValue={page.title} maxLength={200} required onChange={() => setDirty(true)} className="text-base font-medium" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="w-parent">{t("wiki.parent")}</Label>
          <NativeSelect id="w-parent" name="parent_id" defaultValue={page.parent_id ?? ""} className="w-full" onChange={() => setDirty(true)}>
            <NativeSelectOption value="">{t("wiki.topLevel")}</NativeSelectOption>
            {parents.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-wrap gap-0.5 rounded-lg border p-1" role="toolbar" aria-label={t("wiki.toolbar")}>
        {tools.map(({ label, icon: Icon, run }) => (
          <Tooltip key={label}>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={run} />}>
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          id="w-body"
          name="body"
          value={body}
          onChange={(e) => (setBody(e.target.value), setDirty(true))}
          onKeyDown={keys}
          maxLength={200000}
          rows={24}
          aria-label={t("wiki.body")}
          placeholder={t("wiki.bodyPlaceholder")}
          className="min-h-[60vh] rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <div className="min-h-40 rounded-lg border px-4 py-3" aria-label={t("wiki.preview")}>
          {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-sm text-muted-foreground">{t("wiki.preview")}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <span className="text-xs text-muted-foreground">{dirty ? t("wiki.unsaved") : t("wiki.shortcuts")}</span>
      </div>
    </form>
  )
}
