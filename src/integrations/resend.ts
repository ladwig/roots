import type { Integration } from "./registry"

const toResend = (m: import("./registry").Mail) => ({
  from: m.from,
  to: m.to,
  subject: m.subject,
  text: m.text,
  html: m.html,
  headers: m.headers,
  attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
})

// An org's own Resend account, so emails go out from their domain.
export const resend: Integration = {
  key: "resend",
  name: "Resend",
  fields: [
    { key: "apiKey", secret: true, placeholder: "re_…" },
    { key: "from", placeholder: "Club Name <tickets@yourclub.de>" },
  ],
  async test(secret) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${secret.apiKey}` },
    })
    if (!res.ok) throw new Error("integrations.resend.invalidKey")
  },
  email: {
    async send(mail, { secret }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${secret.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(toResend(mail)),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    },
  },
}
