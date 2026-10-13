"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  CodeIcon,
  ExternalLinkIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  TableIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/components/file-upload";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { autosavePage } from "../actions";

type Block = { key: string; icon: LucideIcon; run: (e: Editor) => void };

// Images with resize handles; the width is kept in Markdown as "#w=<px>" on the address (Markdown has no width).
const WikiImage = Image.extend({
  parseMarkdown: (token, helpers) => {
    const href = String(token.href ?? "");
    const w = /#w=(\d+)$/.exec(href);
    return helpers.createNode("image", {
      src: href.replace(/#w=\d+$/, ""),
      alt: token.text,
      title: token.title,
      width: w ? Number(w[1]) : null,
    });
  },
  renderMarkdown: (node) => {
    const a = node.attrs ?? {};
    const w = a.width ? `#w=${Math.round(Number(a.width))}` : "";
    return `![${a.alt ?? ""}](${a.src ?? ""}${w}${a.title ? ` "${a.title}"` : ""})`;
  },
}).configure({
  resize: {
    enabled: true,
    directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
    minWidth: 60,
    minHeight: 40,
    alwaysPreserveAspectRatio: true,
  },
});
// The mounted editor per page: an upload inserts into the editor that is on screen when it finishes, even if the
// component was rebuilt meanwhile.
const live = new Map<string, Editor>();
type Slash = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
  index: number;
};

// Notion-like page editor: big title, write straight into the formatted page. Markdown shortcuts while typing
// ("# ", "- ", "[] ", "> ", "```", "**…**", "---"), "/" opens the block menu, selected text gets a format bar,
// images and files are dropped or pasted where they belong. Saves itself while you type (⌘S saves now); the
// page is stored as Markdown, so view, search, API and history stay as they are.
export function WikiEditor({
  page,
  orgId,
}: {
  page: { id: string; title: string; body: string };
  orgId: string;
}) {
  const t = useT();
  const [title, setTitle] = useState(
    page.title === t("wiki.untitled") ? "" : page.title,
  );
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">(
    "saved",
  );
  const [uploading, setUploading] = useState(0);
  const [slash, setSlash] = useState<Slash | null>(null);
  const [, startSave] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const latest = useRef({ title, slash });
  useEffect(() => {
    latest.current = { title, slash };
  });

  const save = (editor: Editor | null) => {
    if (timer.current) clearTimeout(timer.current);
    if (!editor) return;
    setState("saving");
    startSave(async () => {
      const r = await autosavePage({
        id: page.id,
        title: latest.current.title.trim() || t("wiki.untitled"),
        body: editor.getMarkdown(),
      });
      if (r.error) {
        setState("error");
        toast.error(r.error);
      } else setState((s) => (s === "saving" ? "saved" : s));
    });
  };
  const later = (editor: Editor | null) => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(editor), 1200);
  };

  // Upload, then images as image blocks, other files as links – at `pos` (drop point / cursor). Inserts into the
  // editor as it is after the upload (not the one from before the file dialog), falls back to the end of the page.
  const attach = async (_e: Editor, files: File[], pos: number) => {
    if (!files.length) return;
    setUploading((n) => n + files.length);
    let done: Awaited<ReturnType<typeof uploadFiles>> = [];
    try {
      done = await uploadFiles(
        orgId,
        files,
        { entity: "wiki_pages", entityId: page.id },
        t,
      );
    } finally {
      setUploading((n) => n - files.length);
    }
    // No router.refresh() here: refreshing this page can remount the editor and drop what was just inserted.
    // The attachments list catches up on the next visit.
    const editor = live.get(page.id) ?? editorRef.current;
    if (!done.length) return toast.error(`${t("wiki.insertFailed")} (upload)`);
    if (!editor || editor.isDestroyed)
      return toast.error(`${t("wiki.insertFailed")} (editor)`);
    const nodes = done.map((f) =>
      f.mime.startsWith("image/")
        ? { type: "image", attrs: { src: `/files/${f.id}`, alt: f.name } }
        : {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: f.name,
                marks: [{ type: "link", attrs: { href: `/files/${f.id}` } }],
              },
            ],
          },
    );
    const end = editor.state.doc.content.size;
    let ok = false;
    try {
      ok =
        editor
          .chain()
          .insertContentAt(Math.min(Math.max(pos, 0), end), nodes)
          .run() || editor.chain().insertContentAt(end, nodes).run();
    } catch (err) {
      console.error(err);
    }
    if (ok)
      save(editor); // store it right away
    else toast.error(`${t("wiki.insertFailed")} (insert)`);
  };
  const pickFiles = (editor: Editor) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.hidden = true;
    document.body.append(input); // Safari only fires change for inputs in the page
    const pos = editor.state.selection.from;
    input.onchange = () => {
      attach(editor, [...(input.files ?? [])], pos);
      input.remove();
    };
    input.click();
  };

  const blocks: Block[] = [
    {
      key: "text",
      icon: PilcrowIcon,
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      key: "h1",
      icon: Heading1Icon,
      run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      key: "h2",
      icon: Heading2Icon,
      run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      icon: Heading3Icon,
      run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
      key: "list",
      icon: ListIcon,
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: "numbered",
      icon: ListOrderedIcon,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "checklist",
      icon: ListChecksIcon,
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      key: "quote",
      icon: QuoteIcon,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "code",
      icon: SquareCodeIcon,
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: "table",
      icon: TableIcon,
      run: (e) =>
        e
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      key: "divider",
      icon: MinusIcon,
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    { key: "image", icon: ImageIcon, run: (e) => pickFiles(e) },
  ];
  const label = (k: string) => t.dynamic(`wiki.blocks.${k}`);
  const matches = (q: string) =>
    blocks.filter(
      (b) =>
        !q ||
        label(b.key).toLowerCase().includes(q.toLowerCase()) ||
        b.key.includes(q.toLowerCase()),
    );

  // "/" at the start of an empty-ish paragraph opens the block menu at the cursor.
  const watchSlash = (e: Editor) => {
    const { $from, empty } = e.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
    const m =
      empty && $from.parent.type.name === "paragraph"
        ? /^\/([\p{L}\d]*)$/u.exec(before)
        : null;
    if (!m) return setSlash(null);
    const c = e.view.coordsAtPos($from.pos);
    setSlash((s) => ({
      from: $from.start(),
      to: $from.pos,
      query: m[1],
      x: c.left,
      y: c.bottom,
      index: s && s.query === m[1] ? s.index : 0,
    }));
  };
  const runSlash = (e: Editor, s: Slash, b: Block) => {
    e.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
    setSlash(null);
    b.run(e);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      WikiImage,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? t("wiki.headingPlaceholder")
            : t("wiki.typePlaceholder"),
      }),
      Markdown,
    ],
    content: page.body,
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": t("wiki.body"),
        class: cn(
          "min-h-[50vh] text-base leading-relaxed outline-none",
          "[&_h1]:mt-8 [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-xl [&_h3]:font-semibold",
          "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li_p]:my-0.5",
          "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1 [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li>label]:mt-1 [&_ul[data-type=taskList]_input]:size-4",
          "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_hr]:my-6 [&_hr]:border-border",
          "[&_a[href^='/files/']]:inline-flex [&_a[href^='/files/']]:rounded-lg [&_a[href^='/files/']]:border [&_a[href^='/files/']]:px-3 [&_a[href^='/files/']]:py-1.5 [&_a[href^='/files/']]:text-foreground [&_a[href^='/files/']]:no-underline",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]",
          "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_.ProseMirror-selectednode_img]:outline-2 [&_.ProseMirror-selectednode_img]:outline-primary [&_[data-resize-wrapper]]:max-w-full",
          "[&_[data-resize-handle]]:z-10 [&_[data-resize-handle]]:-m-1.5 [&_[data-resize-handle]]:size-3 [&_[data-resize-handle]]:rounded-full [&_[data-resize-handle]]:border-2 [&_[data-resize-handle]]:border-background [&_[data-resize-handle]]:bg-primary [&_[data-resize-handle]]:opacity-0 [&_[data-resize-wrapper]:hover_[data-resize-handle]]:opacity-100 [&_[data-resize-handle=bottom-right]]:cursor-nwse-resize [&_[data-resize-handle=top-left]]:cursor-nwse-resize [&_[data-resize-handle=bottom-left]]:cursor-nesw-resize [&_[data-resize-handle=top-right]]:cursor-nesw-resize",
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
          "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]",
        ),
      },
      handleKeyDown: (view, event) => {
        const s = latest.current.slash;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          save(editorRef.current);
          return true;
        }
        if (!s || !editorRef.current) return false;
        const list = matches(s.query);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const n = list.length || 1;
          setSlash({
            ...s,
            index: (s.index + (event.key === "ArrowDown" ? 1 : n - 1)) % n,
          });
          return true;
        }
        if (event.key === "Enter" && list[s.index]) {
          event.preventDefault();
          runSlash(editorRef.current, s, list[s.index]);
          return true;
        }
        if (event.key === "Escape") {
          setSlash(null);
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length || !editorRef.current) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from;
        attach(editorRef.current, files, pos);
        return true;
      },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        attach(editorRef.current, files, view.state.selection.from);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      watchSlash(editor);
      later(editor);
    },
    onSelectionUpdate: ({ editor }) => watchSlash(editor),
  });
  useEffect(() => {
    editorRef.current = editor;
    if (!editor) return;
    live.set(page.id, editor);
    return () => {
      if (live.get(page.id) === editor) live.delete(page.id);
    };
  }, [editor, page.id]);

  useEffect(() => {
    if (state !== "dirty" && state !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const list = slash ? matches(slash.query) : [];
  const mark = (on: boolean, l: string, Icon: LucideIcon, run: () => void) => (
    <Button
      type="button"
      size="icon-sm"
      variant={on ? "secondary" : "ghost"}
      aria-label={l}
      title={l}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon />
    </Button>
  );

  return (
    <div className="grid max-w-3xl gap-4">
      <div
        className="flex min-h-5 items-center justify-end gap-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {uploading > 0 && (
          <span className="flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" />{" "}
            {t("wiki.uploading", { count: uploading })}
          </span>
        )}
        <span className={state === "error" ? "text-destructive" : ""}>
          {t.dynamic(`wiki.state.${state}`)}
        </span>
      </div>
      <textarea
        value={title}
        rows={1}
        maxLength={200}
        placeholder={t("wiki.untitled")}
        aria-label={t("wiki.pageTitle")}
        onChange={(e) => (setTitle(e.target.value), later(editor))}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          editor?.commands.focus("start");
        }}
        className="field-sizing-content resize-none bg-transparent font-heading text-4xl font-semibold outline-none placeholder:text-muted-foreground/50"
      />
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
        >
          {editor.isActive("image") ? (
            // An image is selected: size, open the original, remove.
            <>
              {(
                [
                  ["small", 240],
                  ["medium", 480],
                  ["large", 720],
                  ["full", null],
                ] as const
              ).map(([k, w]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={
                    (editor.getAttributes("image").width ?? null) === w
                      ? "secondary"
                      : "ghost"
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .updateAttributes("image", { width: w })
                      .run()
                  }
                >
                  {t.dynamic(`wiki.image.${k}`)}
                </Button>
              ))}
              {mark(false, t("wiki.image.open"), ExternalLinkIcon, () =>
                window.open(
                  String(editor.getAttributes("image").src ?? ""),
                  "_blank",
                  "noopener",
                ),
              )}
              {mark(false, t("wiki.image.remove"), Trash2Icon, () =>
                editor.chain().focus().deleteSelection().run(),
              )}
            </>
          ) : (
            <>
              {mark(
                editor.isActive("bold"),
                t("wiki.tools.bold"),
                BoldIcon,
                () => editor.chain().focus().toggleBold().run(),
              )}
              {mark(
                editor.isActive("italic"),
                t("wiki.tools.italic"),
                ItalicIcon,
                () => editor.chain().focus().toggleItalic().run(),
              )}
              {mark(
                editor.isActive("strike"),
                t("wiki.tools.strike"),
                StrikethroughIcon,
                () => editor.chain().focus().toggleStrike().run(),
              )}
              {mark(
                editor.isActive("code"),
                t("wiki.tools.code"),
                CodeIcon,
                () => editor.chain().focus().toggleCode().run(),
              )}
              {mark(
                editor.isActive("link"),
                t("wiki.tools.link"),
                LinkIcon,
                () => {
                  if (editor.isActive("link"))
                    return editor.chain().focus().unsetLink().run();
                  const href = window.prompt(t("wiki.linkPrompt"), "https://");
                  if (href) editor.chain().focus().setLink({ href }).run();
                },
              )}
            </>
          )}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {slash && list.length > 0 && (
        <div
          role="listbox"
          aria-label={t("wiki.blocksMenu")}
          className="fixed z-50 grid max-h-72 w-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
          style={{ left: slash.x, top: slash.y + 6 }}
        >
          {list.map((b, i) => (
            <button
              key={b.key}
              type="button"
              role="option"
              aria-selected={i === slash.index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && runSlash(editor, slash, b)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm aria-selected:bg-muted"
            >
              <b.icon className="size-4 text-muted-foreground" /> {label(b.key)}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("wiki.editorHint")}</p>
    </div>
  );
}
