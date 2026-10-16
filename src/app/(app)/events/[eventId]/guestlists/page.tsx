import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { FormCard } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { GuestListTable, LIST_COLS } from "../../../guestlists/table"

// The event's guest lists (plus permanent ones, which apply to every event). Lists open on their own page.
export default async function EventGuestLists({ params }: PageProps<"/events/[eventId]/guestlists">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const { eventId } = await params
  const t = await getT()
  const { data } = await ctx.supabase.from("guest_lists").select(LIST_COLS).eq("org_id", ctx.org.id).is("deleted_at", null).or(`event_id.eq.${eventId},event_id.is.null`).order("created_at")
  return (
    <FormCard
      id="guestlists"
      title={t("guestlists.title")}
      action={
        ctx.can("guestlists.manage") && (
          <Button size="sm" render={<Link href={`/guestlists/new?event=${eventId}`} />} nativeButton={false}>
            <PlusIcon /> {t("guestlists.new")}
          </Button>
        )
      }
    >
      <GuestListTable t={t} rows={data ?? []} withEvent={false} empty={t("guestlists.empty")} />
    </FormCard>
  )
}

export const instant = false
