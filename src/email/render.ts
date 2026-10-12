// Turns a campaign/automation into an email. Pure (tested). Three formats:
// - "text": plain text; blank line = new paragraph, URLs become links
// - "rich": HTML from the editor (<RichTextEditor>); styles are inlined so email clients keep them
// - "html": the org's own pasted HTML (e.g. from Stripo/Mailchimp); kept as is, minus scripts
// {placeholders} come from the contact and (for automations) the event payload; values are HTML-escaped.
// Every mail gets the unsubscribe footer and a plain-text version.
export type Vars = Record<string, unknown>
export type Format = "text" | "rich" | "html"
export const FORMATS: Format[] = ["text", "rich", "html"]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const value = (vars: Vars, key: string) => (vars[key] == null || typeof vars[key] === "object" ? "" : String(vars[key]))

export function fill(template: string, vars: Vars, escape = false) {
  return template.replace(/\{([a-z_]+)\}/g, (_, key: string) => (escape ? esc(value(vars, key)) : value(vars, key)))
}

const INLINE: Record<string, string> = {
  p: "margin:0 0 14px",
  h1: "margin:0 0 12px;font-size:24px;line-height:1.3",
  h2: "margin:20px 0 10px;font-size:20px;line-height:1.3",
  h3: "margin:16px 0 8px;font-size:17px;line-height:1.3",
  a: "color:#15803d",
  ul: "margin:0 0 14px;padding-left:22px",
  ol: "margin:0 0 14px;padding-left:22px",
  blockquote: "margin:0 0 14px;padding-left:12px;border-left:3px solid #ddd;color:#555",
  img: "max-width:100%;height:auto",
  hr: "border:0;border-top:1px solid #ddd;margin:20px 0",
}
const inlineStyles = (html: string) => html.replace(/<(p|h1|h2|h3|a|ul|ol|blockquote|img|hr)(\s|>|\/)/g, (_, tag: string, rest: string) => `<${tag} style="${INLINE[tag]}"${rest}`)
const noScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")

export function htmlToText(html: string) {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => `${label.replace(/<[^>]+>/g, "")} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div|tr)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function renderMail(t: { subject: string; body: string; format?: string }, vars: Vars, footer: { org: string; unsubscribeUrl: string; unsubscribeLabel: string }) {
  const subject = fill(t.subject, vars).replace(/\s+/g, " ").trim()
  const foot = `<p style="margin:28px 0 0;font-size:12px;color:#777">${esc(footer.org)} · <a href="${esc(footer.unsubscribeUrl)}" style="color:#777">${esc(footer.unsubscribeLabel)}</a></p>`
  const textFoot = `\n\n--\n${footer.org} · ${footer.unsubscribeLabel}: ${footer.unsubscribeUrl}\n`
  const wrap = (inner: string) => `<div style="font:15px/1.6 system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:600px">${inner}${foot}</div>`

  if (t.format === "html") {
    const body = noScripts(fill(t.body, vars, true))
    const html = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `<div style="max-width:600px;margin:0 auto;font:12px system-ui,sans-serif">${foot}</div></body>`) : body + foot
    return { subject, html, text: htmlToText(body) + textFoot }
  }
  if (t.format === "rich") {
    const body = noScripts(fill(t.body, vars, true))
    return { subject, html: wrap(inlineStyles(body)), text: htmlToText(body) + textFoot }
  }
  const body = fill(t.body, vars).replace(/\r\n/g, "\n").trim()
  const paragraphs = body.split(/\n{2,}/)
  const html = wrap(
    paragraphs.map((p) => `<p style="${INLINE.p}">${esc(p).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="${INLINE.a}">${u}</a>`).replace(/\n/g, "<br>")}</p>`).join(""),
  )
  return { subject, html, text: body + textFoot }
}

/** Placeholders a person gets in every email. */
export const contactVars = (c: { first_name: string | null; last_name: string | null; company: string | null; email: string | null } | null, org: string): Vars => ({
  first_name: c?.first_name ?? "",
  last_name: c?.last_name ?? "",
  name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || "",
  email: c?.email ?? "",
  org,
})
export const BASE_PLACEHOLDERS = ["first_name", "last_name", "name", "email", "org"]
