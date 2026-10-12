// Turns a campaign/automation text into an email. Pure (tested). Body = plain text: blank line = new paragraph,
// URLs become links, {placeholders} come from the contact and (for automations) the event payload.
export type Vars = Record<string, unknown>

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function fill(template: string, vars: Vars) {
  return template.replace(/\{([a-z_]+)\}/g, (m, key: string) => (vars[key] == null || typeof vars[key] === "object" ? "" : String(vars[key])))
}

export function renderMail(t: { subject: string; body: string }, vars: Vars, footer: { org: string; unsubscribeUrl: string; unsubscribeLabel: string }) {
  const subject = fill(t.subject, vars).replace(/\s+/g, " ").trim()
  const body = fill(t.body, vars).replace(/\r\n/g, "\n").trim()
  const paragraphs = body.split(/\n{2,}/)
  const html = `<div style="font:15px/1.6 system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:600px">${paragraphs
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, "<br>")}</p>`)
    .join("")}<p style="margin:28px 0 0;font-size:12px;color:#777">${esc(footer.org)} · <a href="${esc(footer.unsubscribeUrl)}" style="color:#777">${esc(footer.unsubscribeLabel)}</a></p></div>`
  const text = `${body}\n\n--\n${footer.org} · ${footer.unsubscribeLabel}: ${footer.unsubscribeUrl}\n`
  return { subject, text, html }
}

/** Placeholders a person gets in every email. */
export const contactVars = (c: { first_name: string | null; last_name: string | null; company: string | null; email: string | null } | null, org: string): Vars => ({
  first_name: c?.first_name ?? "",
  last_name: c?.last_name ?? "",
  name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || "",
  email: c?.email ?? "",
  org,
})
