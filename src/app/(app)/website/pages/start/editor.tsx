"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import type { Block, BlockType } from "@/site/blocks"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string }

/**
 * The start page's blocks as a list: add, reorder, show/hide, remove, and each block's few fields. Posts everything as
 * JSON in the hidden "blocks" field (validated again on the server). Changes count as edits for the <SaveBar>.
 */
export function SiteEditor({ initial, types, events, forms }: { initial: Block[]; types: BlockType[]; events: Option[]; forms: Option[] }) {
  const t = useT()
  const [blocks, setBlocks] = useState(initial)
  const [adding, setAdding] = useState<BlockType>(types[0])
  const field = useRef<HTMLInputElement>(null)
  const first = useRef(true)
  // Buttons (move, remove, show) change no input themselves: tell the save bar.
  useEffect(() => {
    if (first.current) return void (first.current = false)
    field.current?.dispatchEvent(new Event("input", { bubbles: true }))
  }, [blocks])

  const update = (id: string, patch: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const move = (i: number, by: number) =>
    setBlocks((bs) => {
      const next = [...bs]
      const [b] = next.splice(i, 1)
      next.splice(i + by, 0, b)
      return next
    })
  const add = () =>
    setBlocks((bs) => [
      ...bs,
      {
        id: Math.random().toString(36).slice(2, 10),
        type: adding,
        on: true,
        ...(adding === "events" && { limit: 10 }),
        ...(adding === "event" && { event_id: events[0]?.value }),
        ...(adding === "form" && { form_slug: forms[0]?.value }),
        ...(adding === "links" && { items: [{ label: "", href: "" }] }),
      },
    ])
  const addable = types.filter((ty) => (ty !== "event" || events.length) && (ty !== "form" || forms.length))

  return (
    <div className="grid gap-3">
      <input ref={field} type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      {!blocks.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("site.empty")}</p>}
      {blocks.map((b, i) => {
        const known = types.includes(b.type)
        const id = (f: string) => `blk-${b.id}-${f}`
        return (
          <section key={b.id} className={cn("grid gap-3 rounded-lg border bg-card p-3", !b.on && "opacity-60")}>
            <header className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.dynamic(`site.blocks.${b.type}`)}</span>
              {!known && <span className="text-xs text-muted-foreground">{t("site.moduleOff")}</span>}
              <label className="ml-auto flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={b.on} onChange={(e) => update(b.id, { on: e.target.checked })} className="size-4 accent-primary" /> {t("site.show")}
              </label>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("site.up")} title={t("site.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("site.down")} title={t("site.down")} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("site.remove")} title={t("site.remove")} onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}>
                <Trash2Icon />
              </Button>
            </header>

            {b.type !== "event" && b.type !== "form" && (
              <Field id={id("title")} label={b.type === "hero" ? t("site.headline") : t("site.title")}>
                <Input id={id("title")} value={b.title ?? ""} maxLength={200} onChange={(e) => update(b.id, { title: e.target.value })} placeholder={t.dynamic(`site.placeholders.${b.type}`)} />
              </Field>
            )}
            {(b.type === "hero" || b.type === "portal") && (
              <Field id={id("text")} label={t("site.text")}>
                <Textarea id={id("text")} value={b.text ?? ""} maxLength={1000} rows={2} onChange={(e) => update(b.id, { text: e.target.value })} />
              </Field>
            )}
            {b.type === "text" && (
              <Field id={id("text")} label={t("site.text")} hint={t("site.markdownHint")}>
                <Textarea id={id("text")} value={b.text ?? ""} maxLength={20000} rows={6} onChange={(e) => update(b.id, { text: e.target.value })} />
              </Field>
            )}
            {b.type === "hero" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={id("bl")} label={t("site.buttonLabel")}>
                  <Input id={id("bl")} value={b.button_label ?? ""} maxLength={60} onChange={(e) => update(b.id, { button_label: e.target.value })} placeholder={t("site.buttonLabelPlaceholder")} />
                </Field>
                <Field id={id("bh")} label={t("site.buttonHref")}>
                  <Input id={id("bh")} value={b.button_href ?? ""} maxLength={500} onChange={(e) => update(b.id, { button_href: e.target.value })} placeholder="/e/sommerfest" />
                </Field>
              </div>
            )}
            {b.type === "events" && (
              <Field id={id("limit")} label={t("site.limit")}>
                <Input id={id("limit")} type="number" min={1} max={50} value={b.limit ?? 10} onChange={(e) => update(b.id, { limit: Number(e.target.value) })} className="w-24" />
              </Field>
            )}
            {b.type === "event" && <Picker id={id("ev")} label={t("site.pickEvent")} value={b.event_id} options={events} onChange={(v) => update(b.id, { event_id: v })} />}
            {b.type === "form" && <Picker id={id("form")} label={t("site.pickForm")} value={b.form_slug} options={forms} onChange={(v) => update(b.id, { form_slug: v })} />}
            {b.type === "links" && (
              <div className="grid gap-2">
                {(b.items ?? []).map((item, j) => (
                  <div key={j} className="flex flex-wrap gap-2">
                    <Input
                      aria-label={t("site.linkLabel")}
                      placeholder={t("site.linkLabel")}
                      value={item.label}
                      maxLength={80}
                      className="w-40"
                      onChange={(e) => update(b.id, { items: b.items!.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })}
                    />
                    <Input
                      aria-label={t("site.linkHref")}
                      placeholder="https://instagram.com/…"
                      value={item.href}
                      maxLength={500}
                      className="min-w-48 flex-1"
                      onChange={(e) => update(b.id, { items: b.items!.map((x, k) => (k === j ? { ...x, href: e.target.value } : x)) })}
                    />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("site.remove")} onClick={() => update(b.id, { items: b.items!.filter((_, k) => k !== j) })}>
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
                {(b.items?.length ?? 0) < 12 && (
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => update(b.id, { items: [...(b.items ?? []), { label: "", href: "" }] })}>
                    <PlusIcon /> {t("site.addLink")}
                  </Button>
                )}
              </div>
            )}
          </section>
        )
      })}

      {blocks.length < 30 && addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label={t("site.blockType")} value={adding} onChange={(e) => setAdding(e.target.value as BlockType)}>
            {addable.map((ty) => (
              <NativeSelectOption key={ty} value={ty}>
                {t.dynamic(`site.blocks.${ty}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" onClick={add}>
            <PlusIcon /> {t("site.addBlock")}
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Picker({ id, label, value, options, onChange }: { id: string; label: string; value?: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <Field id={id} label={label}>
      <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full">
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
