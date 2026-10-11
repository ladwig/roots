import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { ShiftSelfView } from "@/components/shift-self-view"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { selfView } from "@/shifts/server"
import { selfAction } from "../actions"

export default async function MyShifts({ searchParams }: PageProps<"/shifts/me">) {
  const ctx = await requirePerm("shifts.self")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const { data: staffId } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  const data = staffId ? await selfView(staffId) : null
  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{t("shifts.tabs.me")}</h1>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {data ? <ShiftSelfView data={data} action={selfAction} /> : <p className="text-sm text-muted-foreground">{t("shifts.notInTeam")}</p>}
    </div>
  )
}

export const instant = false
