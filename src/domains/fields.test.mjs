import assert from "node:assert/strict"
import { test } from "node:test"
import { dnsRecords, normalizeDomain } from "./fields.ts"

test("normalizeDomain: cleans what people paste, rejects ours and junk", () => {
  assert.equal(normalizeDomain(" https://Tickets.Club.de/shop?x=1 "), "tickets.club.de")
  assert.equal(normalizeDomain("club.de."), "club.de")
  assert.equal(normalizeDomain("tickets.club.de:443"), "tickets.club.de")
  assert.equal(normalizeDomain("münchen-verein.de"), "xn--mnchen-verein-wob.de")
  assert.equal(normalizeDomain("localhost"), null)
  assert.equal(normalizeDomain("not a domain"), null)
  assert.equal(normalizeDomain("x.roots.app", ["roots.app"]), null)
  assert.equal(normalizeDomain("roots-berlin.vercel.app"), null)
})

test("dnsRecords: CNAME for subdomains, A for the domain itself, TXT checks", () => {
  const config = { recommendedCNAME: [{ rank: 2, value: "b.vercel-dns.com." }, { rank: 1, value: "abc.vercel-dns-017.com." }], recommendedIPv4: [{ rank: 1, value: ["216.198.79.1"] }] }
  assert.deepEqual(dnsRecords("tickets.club.de", "club.de", config), [{ type: "CNAME", name: "tickets", value: "abc.vercel-dns-017.com" }])
  assert.deepEqual(dnsRecords("club.de", "club.de", config), [{ type: "A", name: "@", value: "216.198.79.1" }])
  assert.deepEqual(dnsRecords("a.b.club.de", "club.de", null, [{ type: "TXT", domain: "_vercel.club.de", value: "vc-domain-verify=x" }]), [
    { type: "CNAME", name: "a.b", value: "cname.vercel-dns.com" },
    { type: "TXT", name: "_vercel", value: "vc-domain-verify=x" },
  ])
})
