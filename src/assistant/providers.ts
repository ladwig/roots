// AI providers for Sprout (bring your own key): which provider a key belongs to, which chat models it offers.
// Pure parts (detect, pickModels) are tested in assistant.test.mjs; the network parts are in keys.ts.
export const PROVIDERS = {
  anthropic: { label: "Claude", vendor: "Anthropic", logo: "/brands/claude.svg", tint: false },
  openai: { label: "ChatGPT", vendor: "OpenAI", logo: "/brands/openai.svg", tint: true },
  google: { label: "Gemini", vendor: "Google", logo: "/brands/gemini.svg", tint: true },
  xai: { label: "Grok", vendor: "xAI", logo: "/brands/xai.svg", tint: true },
} as const
export type Provider = keyof typeof PROVIDERS
export type ModelInfo = { id: string; name: string }

/** The provider of an API key by its prefix (Anthropic before OpenAI: both start with "sk-"). */
export function detectProvider(key: string): Provider | null {
  const k = key.trim()
  if (/^sk-ant-/.test(k)) return "anthropic"
  if (/^xai-/.test(k)) return "xai"
  if (/^AIza[\w-]{20,}$/.test(k)) return "google"
  if (/^sk-[\w-]{20,}$/.test(k)) return "openai"
  return null
}

/** "…ab12": shown in the settings instead of the key. */
export const keyHint = (key: string) => `…${key.trim().slice(-4)}`

// Model lists as the providers return them → only models that can chat (no embeddings, images, audio, moderation …),
// newest first where the list has no order of its own.
const NOT_CHAT = /embed|tts|whisper|dall-e|image|imagen|audio|realtime|transcribe|moderation|search|aqa|veo|computer-use|codex|vision-preview|deep-research|live|native-audio|learnlm|gemma/i
export function pickModels(provider: Provider, raw: unknown): ModelInfo[] {
  const r = (raw ?? {}) as { data?: { id: string; display_name?: string }[]; models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }
  let list: ModelInfo[] = []
  if (provider === "google")
    list = (r.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /^models\/gemini/.test(m.name)).map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name.replace(/^models\//, "") }))
  else {
    const want = provider === "anthropic" ? /^claude/ : provider === "xai" ? /^grok/ : /^(gpt-|o\d|chatgpt)/
    list = (r.data ?? []).filter((m) => want.test(m.id)).map((m) => ({ id: m.id, name: m.display_name || m.id }))
  }
  return list.filter((m) => !NOT_CHAT.test(m.id)).slice(0, 40)
}
