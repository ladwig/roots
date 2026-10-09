import { cache } from "react"
import { createPublicClient } from "@/lib/supabase/server"

// Public data only: the anonymous client sees exactly what the `anon` policies publish (live orgs, published events).
export const getSite = cache(async (slug: string) => {
  const db = createPublicClient()
  const { data: org } = await db.from("orgs").select("id, slug, name, logo_path").eq("slug", slug).maybeSingle()
  return org ? { db, org } : null
})
