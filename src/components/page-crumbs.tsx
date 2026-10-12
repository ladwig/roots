import { Fragment } from "react"
import Link from "next/link"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"

/** Where a record page sits: "Kontakte › Erika Muster". Last item = current page (no link). */
export function PageCrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((it, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {it.href && i < items.length - 1 ? (
                <BreadcrumbLink render={<Link href={it.href} />}>{it.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{it.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
