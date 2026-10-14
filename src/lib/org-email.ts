// Emails in an org's name (tickets, receipts, reminders, newsletters): through the org's own connected email provider
// (Settings → Integrations; any integration with `email`), else roots' account (RESEND_API_KEY + EMAIL_FROM) with
// the org as sender name. Not configured at all → skipped (returns false); callers must not depend on email arriving.
import { createAdminClient } from "@/lib/supabase/admin"
import { getSecret } from "@/integrations/server"
import { integrations, type Mail } from "@/integrations/registry"
import { resend } from "@/integrations/resend"

export type OrgEmail = Omit<Mail, "from">

// A function, not a constant: integrations → payments → tickets → here is an import cycle.
// TODO: sendOrgEmail calls this twice; call it once at the top and reuse the list.
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

/** Can this org send at all (own connected provider, or roots' account)? Lets callers say so before trying. */
export async function emailReady(orgId: string) {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return true
  const { data } = await createAdminClient().from("org_integrations").select("provider").eq("org_id", orgId).in("provider", emailProviders.map((i) => i.key)).eq("status", "connected").limit(1)
  return !!data?.length
}

/** roots' own account. `asName` puts an org's name in front: "Kulturverein via roots <tickets@roots.app>". */
export async function sendPlatformEmail(mail: OrgEmail, asName?: string | null): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  let from = process.env.EMAIL_FROM
  if (!key || !from) {
    // Local dev without a provider: print the mail so links (login, invites) can still be used.
    if (process.env.NODE_ENV !== "production") console.info(`[mail not sent – no RESEND_API_KEY/EMAIL_FROM]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`)
    return false
  }
  if (asName) from = `${asName.replace(/[<>"]/g, "")} <${from.match(/<([^>]+)>/)?.[1] ?? from}>`
  await resend.email!.send({ ...mail, from }, { config: {}, secret: { apiKey: key } })
  return true
}
