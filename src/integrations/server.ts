import { createAdminClient } from "@/lib/supabase/admin"
import type { Secret } from "./registry"

// Server-only: decrypted credentials for an org's integration, or null if not connected.
export async function getSecret(orgId: string, provider: string): Promise<Secret | null> {
  const { data, error } = await createAdminClient().rpc("get_integration_secret", { p_org: orgId, p_provider: provider })
  if (error) throw error
  return data ? JSON.parse(data) : null
}
