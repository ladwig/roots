import { APICallError, convertToModelMessages, createUIMessageStreamResponse, isStepCount, safeValidateUIMessages, streamText, toUIMessageStream, type UIMessage } from "ai"
import { chatTitle, filesForModel, personAuth, sproutTools, systemPrompt } from "@/assistant/agent"
import { modelFor } from "@/assistant/keys"
import { PROVIDERS, type Provider } from "@/assistant/providers"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"

// Sprout's chat endpoint (AI SDK UI stream). The client sends only the new (or approved) message plus the chat id; the
// history comes from the database, so a chat continues on any device. Runs as the signed-in person: their session,
// their role, their own AI key. Danger operations stop for an approval card (signed, so a client can't fake it).
export const maxDuration = 300

type Body = { id?: string; message?: UIMessage; model?: string; page?: { path?: string; title?: string } }

export async function POST(request: Request) {
  const ctx = await getContext()
  const t = await getT()
  const body = (await request.json().catch(() => ({}))) as Body
  const fail = (message: string, status = 400) => Response.json({ error: message }, { status })
  if (!body.id || !/^[0-9a-f-]{36}$/.test(body.id) || !body.message) return fail("invalid_input")
  // History from the database (RLS: only my own chats); the new message is appended, an updated one (approval) replaced.
  const { data: chat } = await ctx.supabase.from("assistant_chats").select("id, title, model, messages").eq("id", body.id).maybeSingle()
  body.model ||= chat?.model
  const [provider, ...rest] = String(body.model ?? "").split(":")
  const modelId = rest.join(":")
  if (!(provider in PROVIDERS) || !modelId) return fail(t("sprout.pickModel"))

  const [{ data: org }, { data: session }, model] = await Promise.all([
    ctx.supabase.from("orgs").select("allow_ai").eq("id", ctx.org.id).maybeSingle(),
    ctx.supabase.auth.getSession(),
    modelFor(ctx.userId, provider as Provider, modelId),
  ])
  if (org?.allow_ai === false) return fail(t("sprout.aiOff"), 403)
  if (!model) return fail(t("sprout.noKey", { provider: PROVIDERS[provider as Provider].label }))
  const token = session.session?.access_token
  if (!token) return fail("unauthorized", 401)

  if (!chat) {
    const { error } = await ctx.supabase.from("assistant_chats").insert({ id: body.id, org_id: ctx.org.id, user_id: ctx.userId, model: body.model })
    if (error) return fail("not_allowed", 403)
  }
  const history = ((chat?.messages ?? []) as unknown as UIMessage[]).filter((m) => m.id !== body.message!.id)
  const auth = personAuth(ctx, token)
  const tools = sproutTools(auth, request)
  const checked = await safeValidateUIMessages({ messages: [...history, body.message], tools })
  const messages = checked.success ? checked.data : [body.message]

  const result = streamText({
    model,
    system: systemPrompt(ctx, body.page ?? {}, t.locale),
    messages: await convertToModelMessages(await filesForModel(ctx.supabase, messages), { tools }),
    tools,
    stopWhen: isStepCount(25),
    toolApproval: { roots_danger: "user-approval" },
    experimental_toolApprovalSecret: process.env.MCP_CONFIRM_SECRET ?? process.env.SUPABASE_SECRET_KEY,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      onError: (e) => {
        // The provider's own words help most (wrong key, no credits, model not available …).
        if (APICallError.isInstance(e)) {
          const vendor = PROVIDERS[provider as Provider].vendor
          const reason = String(e.message).slice(0, 300)
          const s = e.statusCode ?? 0
          const why = /credit|billing|quota|insufficient|balance|licen[cs]e/i.test(reason) ? "credits" : s === 401 ? "key" : s === 429 ? "limit" : s === 402 ? "credits" : s === 404 ? "model" : s === 403 ? "access" : s >= 500 ? "down" : null
          return why ? `${t.dynamic(`sprout.errors.${why}`, { provider: vendor })} (${reason})` : t("sprout.providerError", { provider: vendor, reason })
        }
        console.error("sprout", e)
        return t("sprout.failed")
      },
      onEnd: async ({ messages: all }) => {
        await ctx.supabase
          .from("assistant_chats")
          .update({ messages: all as never, model: body.model, ...(chat?.title ? {} : { title: chatTitle(all) }), updated_at: new Date().toISOString() })
          .eq("id", body.id!)
      },
    }),
  })
}
