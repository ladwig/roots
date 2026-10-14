import Link from "next/link"

/**
 * A small set of views of the same list (≤ 5: Kommend · Vergangen · Alle, Board · Liste) as one segmented control of
 * links. Same look as <Choice> segments. Only as wide as its items; on its own (not in a toolbar) it sits on the right. More options or data-driven ones → <FilterMenu>.
 */
export function Segments({ label, items }: { label: string; items: { href: string; label: React.ReactNode; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex w-fit max-w-full flex-wrap gap-1 justify-self-end rounded-lg bg-muted p-1">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.current ? "true" : undefined}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm [&_svg]:size-3.5"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
