import { cache } from "react"
import { cachedOrg } from "@/lib/public-cache"
import { createPublicClient } from "@/lib/supabase/server"

// Public data only: the anonymous client sees exactly what the `anon` policies publish (live orgs, published events).
// The org itself comes from the public cache (src/lib/public-cache.ts).
export const getSite = cache(async (slug: string) => {
  const org = await cachedOrg(slug)
  return org ? { db: createPublicClient(), org } : null
})
