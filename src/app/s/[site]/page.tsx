// Public surface (<org>.ROOT_DOMAIN, rewritten here by proxy.ts). Only published data belongs here.
// ponytail: placeholder until the Public sites module (phase 4).
export default async function PublicSite({ params }: PageProps<"/s/[site]">) {
  const { site } = await params
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-2 px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold">{site}</h1>
      <p className="text-muted-foreground">This organisation&apos;s public pages will live here.</p>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
