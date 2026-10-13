import Link from "next/link"
import { FileTextIcon } from "lucide-react"
import { Markdown } from "@/components/markdown"
import type { OutsidePage } from "./outside"

// A wiki page outside the App (member area / public): simple reading layout, its released path and sub-pages.
export function OutsideView({ org, page, href, fileHref, back }: { org: string; page: OutsidePage; href: (id: string) => string; fileHref: (id: string) => string; back?: { href: string; label: string } }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-12">
      <header className="grid gap-2">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" aria-label={org}>
          {back ? <Link href={back.href} className="underline-offset-4 hover:underline">{back.label}</Link> : <span>{org}</span>}
          {page.path.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              <Link href={href(p.id)} className="underline-offset-4 hover:underline">
                {p.title}
              </Link>
            </span>
          ))}
        </nav>
        <h1 className="flex items-center gap-3 font-heading text-3xl font-semibold break-words">
          {page.icon && <span className="text-4xl leading-none">{page.icon}</span>}
          {page.title}
        </h1>
      </header>
      <article className="text-base">
        <Markdown links={{ file: fileHref, page: href }}>{page.body}</Markdown>
      </article>
      {page.children.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {page.children.map((c) => (
            <li key={c.id}>
              <Link href={href(c.id)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                {c.icon ? <span>{c.icon}</span> : <FileTextIcon className="size-4 text-muted-foreground" />} <span className="truncate">{c.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
