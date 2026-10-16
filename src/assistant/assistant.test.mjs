import assert from "node:assert/strict"
import { test } from "node:test"
import { detectProvider, keyHint, pickModels } from "./providers.ts"

test("assistant: key → provider, model lists", () => {
  assert.equal(detectProvider("sk-ant-api03-abcdefghijklmnopqrstuvwxyz"), "anthropic")
  assert.equal(detectProvider(" sk-proj-abcdefghijklmnopqrstuvwxyz0123 "), "openai")
  assert.equal(detectProvider("AIzaSyAbcdefghijklmnopqrstuvwxyz012345"), "google")
  assert.equal(detectProvider("xai-abcdef"), "xai")
  assert.equal(detectProvider("hello"), null)
  assert.equal(keyHint("xai-123456789"), "…6789")
  assert.deepEqual(pickModels("openai", { data: [{ id: "gpt-5" }, { id: "text-embedding-3-small" }, { id: "dall-e-3" }, { id: "o4-mini" }] }).map((m) => m.id), ["gpt-5", "o4-mini"])
  assert.deepEqual(pickModels("google", { models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }] }), [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }])
  assert.deepEqual(pickModels("anthropic", { data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }] }), [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }])
  assert.deepEqual(pickModels("xai", { data: [{ id: "grok-4" }, { id: "grok-2-image-1212" }] }).map((m) => m.id), ["grok-4"])
})
