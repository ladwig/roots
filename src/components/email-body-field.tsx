"use client"

import { useState } from "react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Label } from "@/components/ui/label"
import type { Format } from "@/email/render"
import { useT } from "@/i18n/client"

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
const toParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`)
    .join("")

/** Email body with a format switch: plain text, the rich text editor, or pasted HTML (with a sandboxed preview). */
export function EmailBodyField({ id, format: initialFormat, body: initialBody, placeholders, disabled }: { id: string; format: Format; body: string; placeholders: string[]; disabled?: boolean }) {
  const t = useT()
  const [format, setFormat] = useState<Format>(initialFormat)
  const [body, setBody] = useState(initialBody)
  // Switching text → editor keeps the paragraphs; the editor mounts again with the converted content.
  const switchTo = (f: Format) => {
    if (format === "text" && f !== "text" && body.trim() && !body.trim().startsWith("<")) setBody(toParagraphs(body))
    setFormat(f)
  }
  return (
    <div className="grid gap-2">
      <input type="hidden" name="format" value={format} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{t("email.body")}</Label>
        <div role="radiogroup" aria-label={t("email.format")} className="flex gap-1 rounded-lg border p-0.5">
          {(["text", "rich", "html"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              disabled={disabled}
              onClick={() => switchTo(f)}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground aria-checked:bg-primary aria-checked:text-primary-foreground"
            >
              {t(`email.formats.${f}`)}
            </button>
          ))}
        </div>
      </div>
      {format === "rich" ? (
        <RichTextEditor key={`rich-${id}`} id={id} name="body" defaultValue={body} placeholders={placeholders} disabled={disabled} onChange={setBody} />
      ) : (
        <textarea
          id={id}
          name="body"
          rows={format === "html" ? 16 : 12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled}
          maxLength={200000}
          spellCheck={format === "text"}
          className={`${textareaClass} ${format === "html" ? "font-mono text-xs" : ""}`}
        />
      )}
      <p className="text-xs text-muted-foreground">{t(`email.formatHelp.${format}`, { placeholders: placeholders.map((p) => `{${p}}`).join(", ") })}</p>
      {format === "html" && body.trim() && (
        <div className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t("email.preview")}</span>
          {/* sandbox without permissions: the pasted HTML can't run scripts or reach the app */}
          <iframe title={t("email.preview")} sandbox="" srcDoc={body} className="h-96 w-full rounded-lg border bg-white" />
        </div>
      )}
    </div>
  )
}
