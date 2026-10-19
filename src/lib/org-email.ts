// Emails in an org's name (tickets, receipts, reminders, newsletters): through the org's own connected email provider
// (Settings → Integrations; any integration with `email`), else roots' own account (see platformProvider) with
// the org as sender name. Not configured at all → skipped (returns false); callers must not depend on email arriving.
import { createAdminClient } from "@/lib/supabase/admin"
import { getSecret } from "@/integrations/server"
import { integrations, type Mail } from "@/integrations/registry"
import { brevo } from "@/integrations/brevo"
import { resend } from "@/integrations/resend"

export type OrgEmail = Omit<Mail, "from">

// A function, not a constant: integrations → payments → tickets → here is an import cycle.
const emailProviders = () => integrations.filter((i) => i.email)

export async function sendOrgEmail(orgId: string, mail: OrgEmail): Promise<boolean> {
  const db = createAdminClient()
  const providers = emailProviders()
  const [{ data: org }, { data: rows }] = await Promise.all([
    db.from("orgs").select("name").eq("id", orgId).single(),
    db.from("org_integrations").select("provider, config, status").eq("org_id", orgId).in("provider", providers.map((i) => i.key)).eq("status", "connected"),
  ])
  for (const row of rows ?? []) {
    const provider = providers.find((i) => i.key === row.provider)!
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
  if (platformProvider("orgs")) return true
  const { data } = await createAdminClient().from("org_integrations").select("provider").eq("org_id", orgId).in("provider", emailProviders().map((i) => i.key)).eq("status", "connected").limit(1)
  return !!data?.length
}

// roots' own sending (env, no Vault: platform-level). EMAIL_PROVIDER = roots' own mails (logins, invites,
// notifications); unset = the first provider with a key. EMAIL_PROVIDER_ORGS = mails of orgs without their own
// provider (tickets, campaigns …); unset = no fallback, orgs must connect their own. Values: resend | brevo.
// Sender: EMAIL_FROM ("roots <hallo@roots.app>").
const PLATFORM = { resend: { integration: resend, env: "RESEND_API_KEY" }, brevo: { integration: brevo, env: "BREVO_API_KEY" } }
type PlatformKey = keyof typeof PLATFORM
export type Purpose = "platform" | "orgs"

function platformProvider(purpose: Purpose) {
  if (!process.env.EMAIL_FROM) return null
  const wanted = purpose === "orgs" ? process.env.EMAIL_PROVIDER_ORGS : process.env.EMAIL_PROVIDER
  if (purpose === "orgs" && !(wanted && wanted in PLATFORM)) return null // orgs only get ours when explicitly allowed
  const key = (wanted && wanted in PLATFORM ? wanted : (Object.keys(PLATFORM) as PlatformKey[]).find((k) => process.env[PLATFORM[k].env])) as PlatformKey | undefined
  const apiKey = key && process.env[PLATFORM[key].env]
  return apiKey ? { ...PLATFORM[key], key, apiKey } : null
}
export const platformEmailReady = (purpose: Purpose = "platform") => !!platformProvider(purpose)

/** roots' own account. `asName` (an org's mail) puts its name in front: "Kulturverein via roots <tickets@roots.app>". */
export async function sendPlatformEmail(mail: OrgEmail, asName?: string | null): Promise<boolean> {
  const p = platformProvider(asName ? "orgs" : "platform")
  let from = process.env.EMAIL_FROM ?? ""
  if (!p) {
    // Local dev without a provider: print the mail so links (login, invites) can still be used.
    if (process.env.NODE_ENV !== "production") console.info(`[mail not sent – no email provider (EMAIL_FROM + RESEND_API_KEY / BREVO_API_KEY)]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`)
    return false
  }
  if (asName) from = `${asName.replace(/[<>"]/g, "")} <${from.match(/<([^>]+)>/)?.[1] ?? from}>`
  await p.integration.email!.send({ ...mail, from }, { config: {}, secret: { apiKey: p.apiKey } })
  return true
}
