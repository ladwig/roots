import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types"

// Bypasses RLS. Server-only: webhooks, OAuth token refresh, reading integration secrets. Never import from client code.
// `headers`: the API sends x-org-id + x-api-key-hash, which gives this client the key's org rights in the DB.
export const createAdminClient = (headers?: Record<string, string>) =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
    ...(headers ? { global: { headers } } : {}),
  })
