import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"
// App paths reachable without signing in.
const PUBLIC_PATHS = ["/login", "/forgot", "/auth", "/invite", "/api/webhooks", "/api/integrations", "/s"]

export async function proxy(request: NextRequest) {
  // Public surface: <org>.ROOT → /s/<org>/… (no session). app.ROOT and ROOT itself are the App.
  // ponytail: custom domains later = look up the host here and rewrite the same way.
  const host = request.headers.get("host") ?? ""
  const site = host.endsWith(`.${ROOT}`) ? host.slice(0, -ROOT.length - 1) : null
  if (site && site !== "app") {
    const url = request.nextUrl.clone()
    url.pathname = `/s/${site}${url.pathname === "/" ? "" : url.pathname}`
    return NextResponse.rewrite(url)
  }

  // App surface: refresh the Supabase session cookie. Auth checks live in pages/actions, not here.
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data } = await supabase.auth.getClaims()

  // Optimistic gate so signed-out visitors get a real 307 instead of a streamed redirect.
  const { pathname, search } = request.nextUrl
  if (!data?.claims && !PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const login = new URL("/login", request.url)
    if (pathname !== "/") login.searchParams.set("next", pathname + search)
    return NextResponse.redirect(login)
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
