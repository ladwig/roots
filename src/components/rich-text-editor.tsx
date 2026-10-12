"use client"

import { useState } from "react"
import Image from "@tiptap/extension-image"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  BracesIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * Rich text field for any form (emails, descriptions, intros). Posts HTML under `name` like a normal input.
 * `placeholders` adds a menu that inserts {key} tokens (filled in later by the feature, e.g. email rendering).
 */
export function RichTextEditor({
  name,
  defaultValue = "",
  placeholders,
  disabled,
  className,
  id,
  onChange,
}: {
  name: string
  defaultValue?: string
  placeholders?: string[]
  disabled?: boolean
  className?: string
  id?: string
  onChange?: (html: string) => void
}) {
  const t = useT()
  const [html, setHtml] = useState(defaultValue)
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), Image],
    content: defaultValue,
    editable: !disabled,
    immediatelyRender: false, // server render: the editor mounts on the client
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: "prose-sm min-h-48 px-3 py-2 outline-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    onUpdate: ({ editor }) => {
      const value = editor.isEmpty ? "" : editor.getHTML()
      setHtml(value)
      onChange?.(value)
    },
  })
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  })

  const tool = (label: string, Icon: LucideIcon, run: () => void, on?: boolean) => (
    <Tooltip key={label}>
      <TooltipTrigger
        render={
          <Button type="button" size="icon-sm" variant={on ? "secondary" : "ghost"} aria-label={label} aria-pressed={on} disabled={disabled || !editor} onClick={run} />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  const chain = () => editor!.chain().focus()

  return (
    <div className={cn("rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30", className)}>
      <input type="hidden" name={name} value={html} />
      <div role="toolbar" aria-label={t("editor.toolbar")} className="flex flex-wrap gap-0.5 border-b p-1">
        {tool(t("editor.bold"), BoldIcon, () => chain().toggleBold().run(), active?.bold)}
        {tool(t("editor.italic"), ItalicIcon, () => chain().toggleItalic().run(), active?.italic)}
        {tool(t("editor.h2"), Heading2Icon, () => chain().toggleHeading({ level: 2 }).run(), active?.h2)}
        {tool(t("editor.h3"), Heading3Icon, () => chain().toggleHeading({ level: 3 }).run(), active?.h3)}
        {tool(t("editor.bullets"), ListIcon, () => chain().toggleBulletList().run(), active?.bullet)}
        {tool(t("editor.numbers"), ListOrderedIcon, () => chain().toggleOrderedList().run(), active?.ordered)}
        {tool(t("editor.quote"), QuoteIcon, () => chain().toggleBlockquote().run(), active?.quote)}
        {tool(
          t("editor.link"),
          LinkIcon,
          () => {
            // ponytail: browser prompt for the URL; a small popover form if people want link titles/targets.
            const url = window.prompt(t("editor.linkPrompt"), editor?.getAttributes("link").href ?? "https://")
            if (url === null) return
            if (!url || url === "https://") chain().extendMarkRange("link").unsetLink().run()
            else if (/^(https?:|mailto:)/i.test(url)) chain().extendMarkRange("link").setLink({ href: url }).run()
          },
          active?.link,
        )}
        {tool(t("editor.image"), ImageIcon, () => {
          const url = window.prompt(t("editor.imagePrompt"), "https://")
          if (url && /^https:\/\//i.test(url)) chain().setImage({ src: url }).run()
        })}
        {tool(t("editor.divider"), MinusIcon, () => chain().setHorizontalRule().run())}
        {placeholders?.length ? (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger render={<DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t("editor.placeholder")} disabled={disabled || !editor} />} />}>
                <BracesIcon />
              </TooltipTrigger>
              <TooltipContent>{t("editor.placeholder")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent>
              {placeholders.map((p) => (
                <DropdownMenuItem key={p} onClick={() => chain().insertContent(`{${p}}`).run()}>
                  {`{${p}}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <span className="ms-auto flex gap-0.5">
          {tool(t("editor.undo"), Undo2Icon, () => chain().undo().run())}
          {tool(t("editor.redo"), Redo2Icon, () => chain().redo().run())}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
