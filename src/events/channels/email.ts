import { APP_URL } from "@/lib/url"
import { renderEvent } from "../render"
import type { PersonChannelSender } from "../worker"

// Platform emails from roots (Resend): RESEND_API_KEY + EMAIL_FROM ("roots <hallo@your-domain>").
// Org → customer emails (tickets, receipts) are sent by modules in the org's name, not through here.
export const emailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const emailChannel: PersonChannelSender = {
  async send(person, event) {
    if (!emailConfigured()) throw new Error("email not configured")
    const { title, href } = renderEvent(event, person.locale)
    const link = href ? `${APP_URL}${href}` : APP_URL
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: person.email,
        subject: title,
        text: `${title}\n\n${link}`,
        html: `<p style="font:16px/1.5 system-ui,sans-serif">${escape(title)}</p><p><a href="${escape(link)}">${escape(link)}</a></p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Resend: HTTP ${res.status}`)
  },
}
