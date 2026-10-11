import { createServerClient } from "@supabase/ssr"
import { createClient as createPlainClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database } from "./types"

// With `orgId`, every request carries `x-org-id` and the database only shows that org (see public.request_org()).
export async function createClient(orgId?: string) {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: orgId ? { headers: { "x-org-id": orgId } } : undefined,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // ponytail: called from a Server Component; proxy.ts refreshes the session instead
          }
        },
      },
    }
  )
}

// Public surface: always anonymous (even for signed-in visitors), so it only sees what the `anon` policies publish.
export function createPublicClient() {
  return createPlainClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
