import type { Integration } from "./registry"

// An org's own Resend account, so emails go out from their domain.
export const resend: Integration = {
  key: "resend",
  name: "Resend",
  description: "Send emails from your own domain.",
  fields: [
    { key: "apiKey", label: "API key", secret: true, placeholder: "re_…" },
    { key: "from", label: "Sender", placeholder: "Club Name <tickets@yourclub.de>" },
  ],
  async test(secret) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${secret.apiKey}` },
    })
    if (!res.ok) throw new Error("Resend rejected this API key.")
  },
}
