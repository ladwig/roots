// Org → customer emails (tickets, receipts) in the org's name: the org's own Resend account if connected
// (Settings → Integrations), else roots' account (RESEND_API_KEY + EMAIL_FROM) with the org as sender name.
// Not configured at all → skipped (returns false); callers must not depend on email arriving.
import { createAdminClient } from "@/lib/supabase/admin"
import { getSecret } from "@/integrations/server"

export type OrgEmail = {
  to: string
  subject: string
  text: string
  html: string
  attachments?: { filename: string; content: Uint8Array }[]
}

export async function sendOrgEmail(orgId: string, mail: OrgEmail): Promise<boolean> {
  const db = createAdminClient()
  const [{ data: org }, { data: integ }] = await Promise.all([
    db.from("orgs").select("name").eq("id", orgId).single(),
    db.from("org_integrations").select("config, status").eq("org_id", orgId).eq("provider", "resend").maybeSingle(),
  ])
  let key = process.env.RESEND_API_KEY
  let from = process.env.EMAIL_FROM
  if (integ?.status === "connected") {
    const own = await getSecret(orgId, "resend")
    const ownFrom = String((integ.config as Record<string, unknown>)?.from ?? "")
    if (own?.apiKey && ownFrom) [key, from] = [own.apiKey, ownFrom]
  } else if (from && org?.name) {
    // "roots <tickets@roots.app>" → "Kulturverein via roots <tickets@roots.app>"
    const address = from.match(/<([^>]+)>/)?.[1] ?? from
    from = `${org.name.replace(/[<>"]/g, "")} <${address}>`
  }
  if (!key || !from) return false
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${await res.text()}`)
  return true
}
