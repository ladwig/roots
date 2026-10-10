import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { withParams, type SearchParams } from "@/lib/url"

export type Column<R> = { header: string; cell: (row: R) => React.ReactNode; className?: string }

// Plain table; with `rowHref` the whole row is a link (usually "?edit=<id>" to open a drawer).
export function DataTable<R>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
}: {
  columns: Column<R>[]
  rows: R[]
  rowKey: (row: R) => string
  rowHref?: (row: R) => string | undefined
  empty: string
}) {
  if (!rows.length) return <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <>
      {/* Phones: one card per row (first column = title, the rest as label/value). Tablet + desktop: the table. */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row)
          const [first, ...rest] = columns
          return (
            <li key={rowKey(row)} className="relative grid gap-2 rounded-lg border bg-card p-3 text-sm has-[a:hover]:bg-muted/50">
              <div className="font-medium">
                {href ? (
                  <Link
                    href={href}
                    scroll={false}
                    className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                  >
                    {first.cell(row)}
                  </Link>
                ) : (
                  first.cell(row)
                )}
              </div>
              {rest.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {rest.map((c, i) => (
                    <div key={i} className="contents">
                      {c.header && <dt className="text-muted-foreground">{c.header}</dt>}
                      <dd className={c.header ? "min-w-0 break-words" : "col-span-2"}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => (
                <TableHead key={i} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = rowHref?.(row)
              return (
                <TableRow key={rowKey(row)} className={href ? "relative cursor-pointer" : undefined}>
                  {columns.map((c, i) => (
                    <TableCell key={i} className={c.className}>
                      {i === 0 && href ? (
                        <Link
                          href={href}
                          scroll={false}
                          className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                        >
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

// GET form: ?q=… (resets paging).
export function SearchBox({ q, label, keep }: { q?: string; label: string; keep?: Record<string, string> }) {
  return (
    <form role="search" className="w-full sm:max-w-xs">
      {Object.entries(keep ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input type="search" name="q" defaultValue={q} placeholder={label} aria-label={label} />
    </form>
  )
}

export function Pager({
  sp,
  page,
  hasNext,
  newer,
  older,
}: {
  sp: SearchParams
  page: number
  hasNext: boolean
  newer: string
  older: string
}) {
  if (page <= 1 && !hasNext) return null
  return (
    <div className="flex justify-between">
      {page > 1 ? (
        <Button
          render={<Link href={withParams(sp, { page: page - 1 === 1 ? undefined : String(page - 1) })} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {newer}
        </Button>
      ) : (
        <span />
      )}
      {hasNext && (
        <Button render={<Link href={withParams(sp, { page: String(page + 1) })} />} nativeButton={false} variant="outline" size="sm">
          {older}
        </Button>
      )}
    </div>
  )
}

export const PAGE_SIZE = 50
// Range for a page, fetching one extra row to know whether there's a next page.
export const pageRange = (page: number) => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE] as const
