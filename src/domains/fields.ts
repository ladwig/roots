// Own domains, pure parts (tested): what people type → a clean host name, and Vercel's answers → the DNS records to
// enter at the domain provider.
export type DnsRecord = { type: "CNAME" | "A" | "TXT"; name: string; value: string }

const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/

/** "https://Tickets.Club.de/shop" → "tickets.club.de"; null if it isn't a usable domain (or one of ours). */
export function normalizeDomain(input: string, ours: string[] = []) {
  const raw = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#\s]/)[0].replace(/\.$/, "")
  let host: string
  try {
    host = new URL(`https://${raw}`).hostname // IDN → punycode, ports dropped
  } catch {
    return null
  }
  if (!HOST.test(host) || host.length > 253) return null
  if (ours.some((o) => host === o || host.endsWith(`.${o}`)) || host.endsWith(".vercel.app")) return null
  return host
}

type Config = { recommendedCNAME?: { rank: number; value: string }[]; recommendedIPv4?: { rank: number; value: string[] }[] }
const best = <T extends { rank: number }>(list?: T[]) => list?.slice().sort((a, b) => a.rank - b.rank)[0]

/**
 * The records to add. Subdomain (tickets.club.de) → CNAME "tickets"; the domain itself (club.de) → A "@".
 * Plus Vercel's TXT check when the domain is in use on another Vercel account. Name = the part the provider asks for.
 */
export function dnsRecords(domain: string, apexName: string, config: Config | null, verification: { type: string; domain: string; value: string }[] = []): DnsRecord[] {
  const sub = domain === apexName ? "@" : domain.slice(0, -apexName.length - 1)
  const main: DnsRecord =
    sub === "@"
      ? { type: "A", name: "@", value: best(config?.recommendedIPv4)?.value[0] ?? "76.76.21.21" }
      : { type: "CNAME", name: sub, value: (best(config?.recommendedCNAME)?.value ?? "cname.vercel-dns.com").replace(/\.$/, "") }
  const txt = verification
    .filter((v) => v.type === "TXT")
    .map((v): DnsRecord => ({ type: "TXT", name: v.domain === apexName ? "@" : v.domain.endsWith(`.${apexName}`) ? v.domain.slice(0, -apexName.length - 1) : v.domain, value: v.value }))
  return [main, ...txt]
}
