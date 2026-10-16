// Sprout's brain on the server: the tools (same operations as MCP, from src/ops/core.ts), the system prompt, and the
// chat's file parts (stored as roots files, handed to the model as data when it can read them).
import { jsonSchema, tool, type UIMessage } from "ai"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Auth } from "@/api/core"
import type { getContext } from "@/lib/context"
import { describeOps, errorOf, findOps, INSTRUCTIONS, OPERATION_INPUT, runOp, TOOL_TEXT, whoami, type Risk } from "@/ops/core"

type Ctx = Awaited<ReturnType<typeof getContext>>

/** The signed-in person as an operations caller: their role in the active org, their own session (RLS as in the App). */
export function personAuth(ctx: Ctx, token: string): Auth {
  return { key_id: `assistant:${ctx.userId}`, org_id: ctx.org.id, permissions: ctx.role.is_owner ? ["*"] : ctx.role.permissions, modules: [...ctx.modules], token }
}

const callSchema = jsonSchema<Record<string, unknown>>({
  type: "object",
  properties: { ...OPERATION_INPUT, calls: { type: "array", maxItems: 25, description: "Several calls at once: [{ operation, arguments }, …], run in order, each with its own result.", items: { type: "object", properties: OPERATION_INPUT, required: ["operation"] } } },
})

export function sproutTools(auth: Auth, request: Request) {
  const run = (risk: Risk) => async (a: Record<string, unknown>) => {
    try {
      if (Array.isArray(a.calls) && risk !== "danger") {
        const results = []
        for (const c of a.calls.slice(0, 25) as Record<string, unknown>[]) results.push(await runOp(auth, risk, c, request, true).catch(errorOf))
        return { results }
      }
      // Danger runs only after the person approved the card in the chat (toolApproval), so it is confirmed here.
      return await runOp(auth, risk, a, request, true)
    } catch (e) {
      return errorOf(e)
    }
  }
  return {
    roots_whoami: tool({ description: TOOL_TEXT.whoami, inputSchema: jsonSchema({ type: "object", properties: {} }), execute: () => whoami(auth) }),
    roots_find_operations: tool({
      description: TOOL_TEXT.find,
      inputSchema: jsonSchema<{ query?: string; risk?: Risk }>({ type: "object", properties: { query: { type: "string" }, risk: { type: "string", enum: ["read", "write", "danger"] } } }),
      execute: async ({ query, risk }) => findOps(auth, query, risk),
    }),
    roots_describe_operation: tool({
      description: TOOL_TEXT.describe,
      inputSchema: jsonSchema<{ name?: string; names?: string[] }>({ type: "object", properties: { name: { type: "string" }, names: { type: "array", items: { type: "string" } } } }),
      execute: async ({ name, names }) => describeOps(auth, names?.length ? names : [name]),
    }),
    roots_read: tool({ description: TOOL_TEXT.read, inputSchema: callSchema, execute: run("read") }),
    roots_write: tool({ description: TOOL_TEXT.write, inputSchema: callSchema, execute: run("write") }),
    roots_danger: tool({
      description: "Run an operation with risk 'danger' (delete, send emails, money, cannot be undone). The person sees an approval card and must approve it first; if they decline, don't retry.",
      inputSchema: jsonSchema<Record<string, unknown>>({ type: "object", properties: OPERATION_INPUT, required: ["operation"] }),
      execute: run("danger"),
    }),
  }
}

export function systemPrompt(ctx: Ctx, page: { path?: string; title?: string }, locale: string) {
  const now = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "full", timeStyle: "short" })
  return `You are Sprout, the assistant inside roots. You help ${ctx.email} (role: ${ctx.role.name}) in the organisation "${ctx.org.name}". Now: ${now} (Europe/Berlin).
Answer in the person's language (UI language: ${locale === "en" ? "English" : "German"}; use "du" in German). Be brief and concrete: lists over prose, no filler.
You act with exactly the person's rights. Before changing things, read what exists; ask when something important is unclear (prices, dates, recipients) instead of inventing it.
Links: records you created or read carry app_url. Link them as markdown with the path only, e.g. [Sommerfest](/events/…), so they open in the App.
The person is currently on ${page.path ? `the page ${page.path}${page.title ? ` ("${page.title}")` : ""}` : "the start page"}; "here" / "this" usually means that record.
Files the person attached are already stored in roots (Dateien); their file_id is in the message. To put one on a record use files_update { id, entity, entity_id }; as an event picture use events_image_set with image_url = its download_url from files_get.
${INSTRUCTIONS}`
}

/** Title of a new chat: the first words of the first question. */
export function chatTitle(messages: UIMessage[]) {
  const first = messages.find((m) => m.role === "user")
  const text = first?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/\s+/g, " ").trim() ?? ""
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

// Attached files are stored as roots files; the chat keeps "roots-file:<id>". For the model they become the file
// itself (pictures, PDFs, text up to 10 MB), anything else a short note with name and id.
const READABLE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/)/
export async function filesForModel(db: SupabaseClient, messages: UIMessage[]) {
  const ids = [...new Set(messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "file" && p.url.startsWith("roots-file:") ? [p.url.slice(11)] : []))))]
  if (!ids.length) return messages
  const { data: rows } = await db.from("files").select("id, name, path, mime, size").in("id", ids)
  const data = new Map<string, string>()
  await Promise.all(
    (rows ?? [])
      .filter((f) => READABLE.test(f.mime) && f.size <= 10 * 1024 * 1024)
      .map(async (f) => {
        const { data: blob } = await db.storage.from("files").download(f.path)
        if (blob) data.set(f.id, `data:${f.mime};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`)
      }),
  )
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => {
      if (p.type !== "file" || !p.url.startsWith("roots-file:")) return p
      const id = p.url.slice(11)
      const url = data.get(id)
      return url ? { ...p, url } : { type: "text" as const, text: `[Datei ${p.filename ?? ""} (file_id ${id}) – Inhalt nicht lesbar für das Modell]` }
    }),
  }))
}
