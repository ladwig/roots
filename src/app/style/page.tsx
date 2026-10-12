import Link from "next/link"

// Internal design reference: two systems, kept apart on purpose.
export default function StyleIndex() {
  const items = [
    { href: "/style/app", title: "App", text: "The back office: shadcn/ui on Base UI, tokens in src/app/theme.css, rules in AGENTS.md › Design system." },
    { href: "/style/site", title: "Website", text: "The landing page: own look (paper & ink, Hanken Grotesk, paintings), tokens in src/app/site/site.css, sheet in docs/design/site.md." },
  ]
  return (
    <main className="mx-auto grid max-w-3xl gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Style</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-xl border p-6 transition-colors hover:bg-muted">
            <p className="mb-2 text-xl font-medium">{i.title} →</p>
            <p className="text-sm text-muted-foreground">{i.text}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
