import assert from "node:assert/strict"
import { test } from "node:test"
import { cleanCss, cleanHtml, cleanPage } from "./html.ts"

test("cleanHtml: keeps layout, drops everything that runs", () => {
  const out = cleanHtml(`<header class="top" style="background:#000"><a href="/e/x">Tickets</a><a href="javascript:alert(1)">x</a><img src="https://x.de/a.png" onerror="alert(1)"><img src="http://x.de/b.png"><script>alert(1)</script><iframe src="https://evil"></iframe><form action="/x"><input name="a"></form><a href="https://ig.com" target="_blank">IG</a></header>`)
  assert.equal(out, '<header class="top" style="background:#000"><a href="/e/x">Tickets</a><a>x</a><img src="https://x.de/a.png" /><img /><a href="https://ig.com" target="_blank" rel="noopener noreferrer">IG</a></header>')
  assert.equal(cleanHtml('<a href="//evil.com">x</a>'), "<a>x</a>")
  assert.ok(!/onload|<svg[^>]*onload/.test(cleanHtml('<svg onload="alert(1)"><path d="M0 0"/></svg>')))
})

test("cleanCss: can't close the style tag or run script", () => {
  assert.equal(cleanCss("h1{color:red}</style><script>alert(1)</script>"), "h1{color:red}scriptalert(1)/script")
  assert.ok(!/expression\(|javascript:/i.test(cleanCss("a{width:expression(alert(1));background:url(javascript:x)}")))
})

test("cleanPage: keeps style blocks (cleaned) and placeholders", () => {
  const out = cleanPage('<style>.hero{color:red}</style><section class="hero">{{#events}}<a href="{{url}}">{{title}}</a>{{/events}}</section><script>x</script>')
  assert.equal(out, '<style>.hero{color:red}</style><section class="hero">{{#events}}<a href="{{url}}">{{title}}</a>{{/events}}</section>')
  assert.ok(!cleanPage("<style>a{}</style ><style>b{}</style></style><script>").includes("<script"))
})
