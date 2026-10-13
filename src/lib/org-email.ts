// Emails in an org's name (tickets, receipts, reminders, newsletters): through the org's own connected email provider
// (Settings → Integrations; any integration with `email`), else roots' account (RESEND_API_KEY + EMAIL_FROM) with
// the org as sender name. Not configured at all → skipped (returns false); callers must not depend on email arriving.
import { createAdminClient } from "@/lib/supabase/admin"
import { getSecret } from "@/integrations/server"
import { integrations, type Mail } from "@/integrations/registry"
import { resend } from "@/integrations/resend"

export type OrgEmail = Omit<Mail, "from">

// A function, not a constant: integrations → payments → tickets → here is an import cycle.
const emailProviders = () => integrations.filter((i) => i.email)

export async function sendOrgEmail(orgId: string, mail: OrgEmail): Promise<boolean> {
  const db = createAdminClient()
  const [{ data: org }, { data: rows }] = await Promise.all([
    db.from("orgs").select("name").eq("id", orgId).single(),
    db.from("org_integrations").select("provider, config, status").eq("org_id", orgId).in("provider", emailProviders().map((i) => i.key)).eq("status", "connected"),
  ])
  for (const row of rows ?? []) {
    const provider = emailProviders().find((i) => i.key === row.provider)!
    const config = (row.config ?? {}) as Record<string, unknown>
    const secret = await getSecret(orgId, row.provider)
    if (secret && config.from) {
      await provider.email!.send({ ...mail, from: String(config.from) }, { config, secret })
      return true
    }
  }
  return sendPlatformEmail(mail, org?.name)
}

/** roots' own account. `asName` puts an org's name in front: "Kulturverein via roots <tickets@roots.app>". */
export async function sendPlatformEmail(mail: OrgEmail, asName?: string | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  let from = process.env.EMAIL_FROM
  if (!key || !from) return false
  if (asName) from = `${asName.replace(/[<>"]/g, "")} <${from.match(/<([^>]+)>/)?.[1] ?? from}>`
  await resend.email!.send({ ...mail, from }, { config: {}, secret: { apiKey: key } })
  return true
}
