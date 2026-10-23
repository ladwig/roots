// Public images (logos, event pictures) under our own domains: /i/<path in the "images" bucket>. Mails use it so their
// images come from the same domain as their links (spam filters, Gmail), on an org's own domain too. Paths are unique
// per upload (replaceImage), so the answer is cached for good.
const PATH = /^(users|orgs)\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif)$/

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/")
  if (!PATH.test(path)) return new Response("Not found", { status: 404 })
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/${path}`)
  if (!res.ok || !res.body) return new Response("Not found", { status: 404 })
  return new Response(res.body, {
    headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  })
}
