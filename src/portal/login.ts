// Member-area login link by email (hosted portal + public API). Callers answer the same whether or not the
// address is known (no member lookup from outside).
import type { T } from "@/i18n/translate"
import { emailReady, sendOrgEmail } from "@/lib/org-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/url"
import { createLoginToken } from "./session"

/**
 * false = the mail couldn't go out (no email provider, or the provider failed), so the page can say so instead of
 * promising a mail. No provider is checked before the lookup (same answer for every address); a failing provider
 * only shows for known addresses. ponytail: accepted, it only happens while sending is broken anyway.
 */
export async function sendLoginLink(org: { id: string; name: string; site_domain?: string | null }, slug: string, email: string, t: T): Promise<boolean> {
  // Dev goes on without a provider: the mail (with the link) is printed to the server log, the page still says it failed.
  if (process.env.NODE_ENV === "production" && !(await emailReady(org.id))) return false
  // ponytail: simple flood guard per address (3 links per 10 minutes); a per-IP limit if the form gets abused.
  const db = createAdminClient()
  const { data: contact } = await db.from("contacts").select("id").eq("org_id", org.id).eq("email", email).is("deleted_at", null).maybeSingle()
  const { count } = contact
    ? await db.from("portal_tokens").select("id", { count: "exact", head: true }).eq("contact_id", contact.id).eq("kind", "login").gt("created_at", new Date(Date.now() - 600_000).toISOString())
    : { count: 0 }
  if ((count ?? 0) < 3) {
    const login = await createLoginToken(org.id, email)
    if (login) {
      const link = `${siteUrl(slug, "/portal/login", org.site_domain)}?token=${login.token}`
      const text = [t("portal.mailHello", { name: login.firstName ?? "" }), "", t("portal.mailIntro", { org: org.name }), "", link, "", t("portal.mailNote")].join("\n")
      return sendOrgEmail(org.id, {
        to: email,
        subject: t("portal.mailSubject", { org: org.name }),
        text,
        html: `<div style="font:15px/1.6 system-ui,sans-serif">${text
          .split("\n")
          .map((l) => (l === link ? `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#15803d;color:#fff;border-radius:8px;text-decoration:none">${t("portal.mailButton")}</a></p>` : `<p style="margin:0 0 8px">${l.replace(/[<>&]/g, "")}</p>`))
          .join("")}</div>`,
      }).catch((e) => (console.error(e), false))
    }
  }
  return true
}
