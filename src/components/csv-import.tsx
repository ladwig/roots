"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useT } from "@/i18n/client"
import { decodeCsv, guessMapping, parseCsv, type ImportField } from "@/lib/csv"

export type ImportOutcome = { inserted: number; updated: number; skipped: number; errors: { line: number; message: string }[] } | { error: string }
type Mapped = Record<string, string>
const PREVIEW_ROWS = 10

// Generic CSV import: pick a file → map columns (guessed from headers) → preview with row errors → import.
// The module passes its fields, a validator (same one the server uses) and the server action.
export function CsvImport({
  fields,
  validate,
  onImport,
  matchLabel,
  maxRows,
  doneHref,
}: {
  fields: ImportField[]
  validate: (row: Mapped) => { error: string; field?: string } | { row: unknown }
  onImport: (input: { rows: Mapped[]; mode: "skip" | "update" }) => Promise<ImportOutcome>
  matchLabel: string // what identifies an existing record, e.g. "E-Mail"
  maxRows: number
  doneHref: string
}) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<(string | null)[]>([])
  const [mode, setMode] = useState<"skip" | "update">("skip")
  const [result, setResult] = useState<Extract<ImportOutcome, { inserted: number }> | null>(null)

  async function pick(f: File | undefined) {
    setResult(null)
    if (!f) return setFile(null)
    const rows = parseCsv(decodeCsv(await f.arrayBuffer()))
    if (rows.length < 2) return void toast.error(t("import.empty"))
    if (rows.length - 1 > maxRows) return void toast.error(t("import.tooMany", { max: maxRows }))
    setFile({ name: f.name, headers: rows[0], rows: rows.slice(1) })
    setMapping(guessMapping(rows[0], fields))
  }

  const mapped: Mapped[] = useMemo(
    () =>
      file?.rows.map((r) => Object.fromEntries(mapping.flatMap((key, i) => (key ? [[key, r[i] ?? ""]] : [])))) ?? [],
    [file, mapping],
  )
  const checked = useMemo(() => mapped.map((row, i) => ({ line: i + 2, row, res: validate(row) })), [mapped, validate])
  const cols = fields.filter((f) => mapping.includes(f.key))
  const bad = checked.filter((c) => "error" in c.res)
  const good = checked.length - bad.length
  const errorText = (r: { error: string; field?: string }) => (r.field ? `${r.field}: ` : "") + t.dynamic(r.error)

  function submit() {
    start(async () => {
      const res = await onImport({ rows: checked.filter((c) => !("error" in c.res)).map((c) => c.row), mode })
      if ("error" in res) return void toast.error(res.error)
      setResult(res)
      toast.success(t("import.done", { inserted: res.inserted, updated: res.updated, skipped: res.skipped }))
      router.refresh()
    })
  }

  if (result)
    return (
      <div className="grid gap-4">
        <p className="text-sm">{t("import.done", { inserted: result.inserted, updated: result.updated, skipped: result.skipped })}</p>
        {result.errors.length > 0 && <ErrorList t={t} items={result.errors} />}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(doneHref)}>{t("import.toList")}</Button>
          <Button variant="outline" onClick={() => (setResult(null), setFile(null))}>
            {t("import.another")}
          </Button>
        </div>
      </div>
    )

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="csv-file">{t("import.file")}</Label>
        <Input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => pick(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">{t("import.fileHint", { max: maxRows })}</p>
      </div>

      {file && (
        <>
          <section className="grid gap-3" aria-labelledby="csv-map">
            <h2 id="csv-map" className="font-medium">
              {t("import.mapTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("import.mapHint")}</p>
            <ul className="grid gap-2">
              {file.headers.map((h, i) => {
                const sample = file.rows.find((r) => r[i]?.trim())?.[i]
                return (
                  <li key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{h || t("import.noHeader", { n: i + 1 })}</p>
                      {sample && <p className="truncate text-xs text-muted-foreground">{t("import.example", { value: sample })}</p>}
                    </div>
                    <ArrowRightIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                    <NativeSelect
                      aria-label={t("import.mapTo", { column: h })}
                      value={mapping[i] ?? ""}
                      onChange={(e) => setMapping((m) => m.map((v, j) => (j === i ? e.target.value || null : v === e.target.value ? null : v)))}
                      className="w-full"
                    >
                      <NativeSelectOption value="">{t("import.ignore")}</NativeSelectOption>
                      {fields.map((f) => (
                        <NativeSelectOption key={f.key} value={f.key}>
                          {f.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </li>
                )
              })}
            </ul>
          </section>

          <fieldset className="grid gap-2">
            <legend className="mb-2 font-medium">{t("import.existing", { match: matchLabel })}</legend>
            {(["skip", "update"] as const).map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5" />
                <span>{t.dynamic(`import.mode.${m}`)}</span>
              </label>
            ))}
          </fieldset>

          <section className="grid gap-3" aria-labelledby="csv-preview">
            <h2 id="csv-preview" className="font-medium">
              {t("import.preview")}
            </h2>
            <p className="text-sm">{t("import.summary", { good, bad: bad.length })}</p>
            {bad.length > 0 && (
              <ErrorList t={t} items={bad.slice(0, 50).map((b) => ({ line: b.line, message: errorText(b.res as { error: string; field?: string }) }))} more={bad.length - 50} />
            )}
            {cols.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-0">{t("import.line")}</TableHead>
                      <TableHead className="w-0">
                        <span className="sr-only">{t("import.status")}</span>
                      </TableHead>
                      {cols.map((c) => (
                        <TableHead key={c.key} className="whitespace-nowrap">
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checked.slice(0, PREVIEW_ROWS).map((c) => (
                      <TableRow key={c.line} className={"error" in c.res ? "bg-destructive/10" : undefined}>
                        <TableCell className="text-muted-foreground tabular-nums">{c.line}</TableCell>
                        <TableCell>
                          {"error" in c.res ? (
                            <span className="text-xs whitespace-nowrap text-destructive">{errorText(c.res)}</span>
                          ) : (
                            <CheckIcon className="size-4 text-primary" aria-label={t("import.ok")} />
                          )}
                        </TableCell>
                        {cols.map((col) => (
                          <TableCell key={col.key} className="max-w-48 truncate">
                            {c.row[col.key]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {checked.length > PREVIEW_ROWS && <p className="text-xs text-muted-foreground">{t("import.previewMore", { shown: PREVIEW_ROWS, total: checked.length })}</p>}
          </section>

          <Button onClick={submit} disabled={pending || good === 0} className="justify-self-start">
            {pending ? t("import.importing") : t("import.submit", { count: good })}
          </Button>
        </>
      )}
    </div>
  )
}

function ErrorList({ t, items, more = 0 }: { t: ReturnType<typeof useT>; items: { line: number; message: string }[]; more?: number }) {
  return (
    <ul className="grid max-h-60 gap-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      {items.map((e) => (
        <li key={e.line}>{t("import.lineError", { line: e.line, message: e.message })}</li>
      ))}
      {more > 0 && <li>{t("import.moreErrors", { count: more })}</li>}
    </ul>
  )
}
