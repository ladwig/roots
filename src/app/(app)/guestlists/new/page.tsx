import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { ListForm } from "../list-form"

export default async function NewGuestListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("guestlists.manage")
  if (!ctx.modules.has("guestlists")) notFound()
  const t = await getT()
  const sp = await searchParams
  const event = param(sp, "event")
  return (
    <NewPage list={{ href: "/guestlists", label: t("guestlists.nav") }} title={t("guestlists.new")} error={param(sp, "error")}>
      <ListForm eventId={event && /^[0-9a-f-]{36}$/.test(event) ? event : null} />
    </NewPage>
  )
}

export const instant = false
