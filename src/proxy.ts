import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"
// App paths reachable without signing in.
const PUBLIC_PATHS = ["/.well-known", "/login", "/forgot", "/auth", "/invite", "/api/webhooks", "/api/integrations", "/api/cron", "/api/v1", "/api/mcp", "/api/public", "/api/docs", "/api/unsubscribe", "/checkout", "/s", "/u", "/site", "/style"]
// On the bare domain these stay at the root; every other App path lives under /app there.
const ROOT_PATHS = ["/.well-known", "/oauth", "/login", "/forgot", "/auth", "/invite", "/api", "/checkout", "/s", "/u", "/site", "/style"]
const SITE_PAGES = ["/product", "/imprint", "/privacy"]
const under = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`))

// Hosts:
// - <org>.ROOT  → the org's public site (/s/<org>/…)
// - app.ROOT    → the App at the root (/contacts, …)
// - ROOT (bare; also *.vercel.app while there's no own domain) → the website at "/", the App under /app/…,
//   the paths in ROOT_PATHS at the root. Internally App routes have no /app prefix: a rewrite strips it.
// ponytail: on the bare domain an in-app link like "/contacts" costs one redirect to "/app/contacts" (links are
// written without the prefix). Fine while app.<domain> is the main entry; make links host-aware if it isn't.
export async function proxy(request: NextRequest) {
  // ponytail: custom domains later = look up the host here and rewrite like org subdomains.
  const host = request.headers.get("host") ?? ""
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
