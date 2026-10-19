import { platformEmailReady, sendPlatformEmail } from "@/lib/org-email"
import { APP_URL } from "@/lib/url"
import { renderEvent } from "../render"
import type { PersonChannelSender } from "../worker"

// Platform emails from roots (sendPlatformEmail): EMAIL_FROM + the provider in EMAIL_PROVIDER (see src/lib/org-email.ts).
// Org → customer emails (tickets, receipts) are sent by modules in the org's name, not through here.
export const emailConfigured = () => platformEmailReady()

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const emailChannel: PersonChannelSender = {
  async send(person, event) {
    if (!emailConfigured()) throw new Error("email not configured")
    const { title, href } = renderEvent(event, person.locale)
    const link = href ? `${APP_URL}${href}` : APP_URL
    await sendPlatformEmail({
      to: person.email,
      subject: title,
      text: `${title}\n\n${link}`,
      html: `<p style="font:16px/1.5 system-ui,sans-serif">${escape(title)}</p><p><a href="${escape(link)}">${escape(link)}</a></p>`,
    })
  },
}
