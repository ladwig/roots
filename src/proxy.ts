import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"
// App paths reachable without signing in.
const PUBLIC_PATHS = ["/.well-known", "/login", "/forgot", "/auth", "/invite", "/api/webhooks", "/api/integrations", "/api/cron", "/api/v1", "/api/mcp", "/api/public", "/api/docs", "/api/unsubscribe", "/api/upload", "/upload", "/checkout", "/s", "/u", "/site", "/style"]
// On the bare domain these stay at the root; every other App path lives under /app there.
const ROOT_PATHS = ["/.well-known", "/oauth", "/upload", "/login", "/forgot", "/auth", "/invite", "/api", "/checkout", "/s", "/u", "/site", "/style"]
const SITE_PAGES = ["/product", "/imprint", "/privacy"]
const under = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`))

// Hosts:
// - <org>.ROOT  → the org's public site (/s/<org>/…)
// - app.ROOT    → the App at the root (/contacts, …)
// - ROOT (bare; also *.vercel.app while there's no own domain) → the website at "/", the App under /app/…,
//   the paths in ROOT_PATHS at the root. Internally App routes have no /app prefix: a rewrite strips it.
// ponytail: on the bare domain an in-app link like "/contacts" costs one redirect to "/app/contacts" (links are
// written without the prefix). Fine while app.<domain> is the main entry; make links host-aware if it isn't.
// Own domains (tickets.club.de): which org a host belongs to, asked anonymously (definer RPC site_for_host), kept a
// minute per instance. ponytail: in-memory per instance; Global Config if lookups ever show up in latency.
const hosts = new Map<string, { slug: string | null; until: number }>()
async function siteForHost(host: string) {
  const hit = hosts.get(host)
  if (hit && hit.until > Date.now()) return hit.slug
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/site_for_host`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ p_host: host }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => null)
  if (!res?.ok) return hit?.slug ?? null // database hiccup: keep serving what we knew
  const slug = ((await res.json()) as string | null) || null
  if (hosts.size > 1000) hosts.clear()
  hosts.set(host, { slug, until: Date.now() + 60_000 })
  return slug
}
const ownHost = (host: string) => host === ROOT || host.endsWith(`.${ROOT}`) || host.endsWith(".vercel.app") || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase()
  if (!ownHost(host)) {
    const slug = await siteForHost(host.replace(/:\d+$/, ""))
    if (!slug) return new NextResponse("This domain isn't connected to a site.", { status: 404 })
    const { pathname } = request.nextUrl
    if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return NextResponse.next()
    // Links on public pages carry /s/<slug>/… (path mode): clean addresses on the own domain.
    // ponytail: one redirect per such click; make sitePath host-aware if it matters.
    if (pathname === `/s/${slug}` || pathname.startsWith(`/s/${slug}/`)) {
      if (request.method !== "GET") return NextResponse.next()
      const url = request.nextUrl.clone()
      url.pathname = pathname.slice(`/s/${slug}`.length) || "/"
      return NextResponse.redirect(url, 308)
    }
    const url = request.nextUrl.clone()
    url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`
    return NextResponse.rewrite(url)
  }
  const sub = host.endsWith(`.${ROOT}`) ? host.slice(0, -ROOT.length - 1) : null
  if (sub && sub !== "app") {
    // Already the internal route (redirect target of a public Server Action, see siteActionPath).
    if (request.nextUrl.pathname === `/s/${sub}` || request.nextUrl.pathname.startsWith(`/s/${sub}/`)) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = `/s/${sub}${url.pathname === "/" ? "" : url.pathname}`
    return NextResponse.rewrite(url)
  }
  const { pathname, search } = request.nextUrl
  if (!sub) {
    if (pathname === "/") return NextResponse.rewrite(new URL(`/site${search}`, request.url))
    // Website pages beyond "/" (English paths): /product → src/app/site/product
    if (SITE_PAGES.includes(pathname)) return NextResponse.rewrite(new URL(`/site${pathname}${search}`, request.url))
    if (pathname !== "/app" && !pathname.startsWith("/app/") && !under(pathname, ROOT_PATHS))
      return NextResponse.redirect(new URL(`/app${pathname}${search}`, request.url))
  }
  // "/app/…" on any host → the App route without the prefix.
  const appPath = pathname === "/app" || pathname.startsWith("/app/") ? pathname.slice(4) || "/" : pathname
  const pass = () => (appPath === pathname ? NextResponse.next({ request }) : NextResponse.rewrite(new URL(`${appPath}${search}`, request.url), { request }))

  // App surface: refresh the Supabase session cookie. Auth checks live in pages/actions, not here.
  let response = pass()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = pass()
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data } = await supabase.auth.getClaims()

  // Optimistic gate so signed-out visitors get a real 307 instead of a streamed redirect.
  // A wiki page link opened without an account: public page / member area if it's released there.
  const wiki = !data?.claims && /^\/wiki\/([0-9a-f-]{36})$/.exec(appPath)
  if (wiki) return NextResponse.redirect(new URL(`/api/public/wiki-link/${wiki[1]}`, request.url))
  if (!data?.claims && !under(appPath, PUBLIC_PATHS)) {
    const login = new URL("/login", request.url)
    if (appPath !== "/") login.searchParams.set("next", pathname + search)
    return NextResponse.redirect(login)
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
