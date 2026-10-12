import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { toCsv, toXlsx } from "@/lib/export"
import { EXPORTERS } from "./exporters"

// /export/<entity>?format=csv|xlsx&<the list's filters> → file download. Permissions as for the list itself (RLS too).
export async function GET(request: Request, { params }: RouteContext<"/export/[entity]">) {
  const { entity } = await params
  const exporter = EXPORTERS[entity]
  const ctx = await getContext()
  if (!exporter || !ctx.modules.has(exporter.module) || !ctx.can(exporter.perm)) return new NextResponse("Not found", { status: 404 })
  const sp = new URL(request.url).searchParams
  const table = await exporter.load(ctx, await getT(), sp)
  const name = `${exporter.name}-${new Date().toISOString().slice(0, 10)}`
  return sp.get("format") === "xlsx"
    ? new NextResponse(new Uint8Array(toXlsx(table, exporter.name)), {
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"` },
      })
    : new NextResponse(toCsv(table), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` } })
}
