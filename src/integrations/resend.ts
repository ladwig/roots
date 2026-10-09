import type { Integration } from "./registry"

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
}
