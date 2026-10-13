import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { createEvent } from "../actions"
import { EventForm } from "../event-form"

export default async function NewEventPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("events.manage")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const sp = await searchParams
  return (
    <NewPage list={{ href: "/events", label: t("eventsPage.nav") }} title={t("eventsPage.new")} error={param(sp, "error")}>
      <EventForm t={t} action={createEvent} />
    </NewPage>
  )
}

export const instant = false
