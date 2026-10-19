import assert from "node:assert/strict"
import { test } from "node:test"
import { button, contactVars, renderMail } from "./render.ts"

test("placeholders, paragraphs, links, footer", () => {
  const vars = { ...contactVars({ first_name: "Ana", last_name: "M", company: null, email: "a@x.de" }, "TSV"), number: 42, payload: { x: 1 } }
  const m = renderMail({ subject: "Hallo {first_name}!", body: "Willkommen, {name} (Nr. {number}).\n\nInfos: https://x.de/a?b=1\nZeile <b>2</b>{payload}{unknown}" }, vars, { org: "TSV", unsubscribeUrl: "https://app/u/1", unsubscribeLabel: "Abmelden" })
  assert.equal(m.subject, "Hallo Ana!")
  assert.match(m.html, /Willkommen, Ana M \(Nr\. 42\)\./)
  assert.match(m.html, /<a href="https:\/\/x.de\/a\?b=1" style=/)
  assert.match(m.html, /Zeile &#60;b&#62;2&#60;\/b&#62;<\/p>/)
  assert.match(m.text, /Abmelden: https:\/\/app\/u\/1/)
})

test("rich: escaped placeholders, inline styles, text version", () => {
  const m = renderMail({ format: "rich", subject: "Hi", body: '<h2>Hallo {first_name}</h2><p>Mehr: <a href="https://x.de">hier</a></p><ul><li>Eins</li></ul>' }, { first_name: "<Ana>" }, { org: "TSV", unsubscribeUrl: "https://app/u/1", unsubscribeLabel: "Abmelden" })
  assert.match(m.html, /<h2 style="[^"]+">Hallo &#60;Ana&#62;<\/h2>/)
  assert.match(m.html, /<a style="color:#15803d" href="https:\/\/x.de">/)
  assert.match(m.text, /Hallo <Ana>\n\nMehr: hier \(https:\/\/x.de\)\n\n• Eins/)
})

test("html: kept, scripts and handlers removed, footer before </body>", () => {
  const m = renderMail({ format: "html", subject: "Hi", body: '<html><body><table onclick="x()"><tr><td>Hallo {name}</td></tr></table><script>alert(1)</script></body></html>' }, { name: "Ana" }, { org: "TSV", unsubscribeUrl: "https://app/u/1", unsubscribeLabel: "Abmelden" })
  assert.ok(!m.html.includes("<script") && !m.html.includes("onclick"))
  assert.match(m.html, /Hallo Ana/)
  assert.match(m.html, /Abmelden<\/a><\/p><\/div><\/body>/)
})

test("event mails: {button} stays our markup (not escaped, own style), text gets label + url, no unsubscribe", () => {
  const vars = { name: "<Ana>", button: button("https://x.de/t/1?k=a&b", "Tickets ansehen"), message: "2 Tickets" }
  const m = renderMail({ format: "rich", subject: "Hi", body: "<p>Hallo {name}</p><p>{message}</p><p>{button}</p>" }, vars, { org: "TSV", logo: "https://img/l.png" })
  assert.match(m.html, /<a href="https:\/\/x.de\/t\/1\?k=a&#38;b" style="display:inline-block[^"]*">Tickets ansehen<\/a>/)
  assert.match(m.html, /Hallo &#60;Ana&#62;/)
  assert.match(m.html, /^<div[^>]*><img src="https:\/\/img\/l.png"/)
  assert.ok(!m.html.includes("undefined") && !m.text.includes("undefined"))
  assert.match(m.text, /Tickets ansehen \(https:\/\/x.de\/t\/1\?k=a&b\)/)
  const plain = renderMail({ format: "text", subject: "Hi", body: "{button}" }, vars, { org: "TSV" })
  assert.match(plain.text, /^Tickets ansehen: https:\/\/x.de\/t\/1\?k=a&b/)
})
