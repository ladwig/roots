import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types"

// Bypasses RLS. Server-only: webhooks, OAuth token refresh, reading integration secrets. Never import from client code.
export const createAdminClient = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
