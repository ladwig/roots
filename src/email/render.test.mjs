import assert from "node:assert/strict"
import { test } from "node:test"
import { contactVars, renderMail } from "./render.ts"

test("placeholders, paragraphs, links, footer", () => {
  const vars = { ...contactVars({ first_name: "Ana", last_name: "M", company: null, email: "a@x.de" }, "TSV"), number: 42, payload: { x: 1 } }
  const m = renderMail({ subject: "Hallo {first_name}!", body: "Willkommen, {name} (Nr. {number}).\n\nInfos: https://x.de/a?b=1\nZeile <b>2</b>{payload}{unknown}" }, vars, { org: "TSV", unsubscribeUrl: "https://app/u/1", unsubscribeLabel: "Abmelden" })
  assert.equal(m.subject, "Hallo Ana!")
  assert.match(m.html, /Willkommen, Ana M \(Nr\. 42\)\./)
  assert.match(m.html, /<a href="https:\/\/x.de\/a\?b=1">/)
  assert.match(m.html, /Zeile &#60;b&#62;2&#60;\/b&#62;<\/p>/)
  assert.match(m.text, /Abmelden: https:\/\/app\/u\/1/)
})
