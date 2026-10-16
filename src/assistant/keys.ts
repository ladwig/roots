// Server side of the providers: check a key and list its chat models (one request to the provider), and the AI SDK
// model for a stored key. Keys come from Vault (get_ai_key, service role) and never leave the server.
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"
import { createAdminClient } from "@/lib/supabase/admin"
import { pickModels, type ModelInfo, type Provider } from "./providers"

const MODEL_LISTS: Record<Provider, (key: string) => [string, RequestInit]> = {
  anthropic: (key) => ["https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }],
  openai: (key) => ["https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } }],
  google: (key) => [`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, {}],
  xai: (key) => ["https://api.x.ai/v1/models", { headers: { authorization: `Bearer ${key}` } }],
}

/** The key's chat models, or the provider's own reason when it rejects the key (wrong key, no credits …). */
export async function fetchModels(provider: Provider, key: string): Promise<{ models: ModelInfo[] } | { error: string }> {
  const [url, init] = MODEL_LISTS[provider](key.trim())
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!res) return { error: "unreachable" }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const b = body as { error?: string | { message?: string }; message?: string } | null
    return { error: (typeof b?.error === "string" ? b.error : b?.error?.message) || b?.message || `HTTP ${res.status}` }
  }
  return { models: pickModels(provider, body) }
}

/** AI SDK model for the person's stored key, or null without a key. */
export async function modelFor(userId: string, provider: Provider, modelId: string) {
  const { data: apiKey } = await createAdminClient().rpc("get_ai_key", { p_user: userId, p_provider: provider })
  if (!apiKey) return null
  if (provider === "anthropic") return createAnthropic({ apiKey })(modelId)
  if (provider === "openai") return createOpenAI({ apiKey })(modelId)
  if (provider === "google") return createGoogle({ apiKey })(modelId)
  return createXai({ apiKey })(modelId)
}
