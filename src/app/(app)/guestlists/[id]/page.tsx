import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, siteUrl, withParams } from "@/lib/url"
import { addEntries, removeEntry, renameEntry, setLink, trashList } from "../actions"
import { ListForm } from "../list-form"

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export default async function GuestListPage({ params, searchParams }: PageProps<"/guestlists/[id]">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const { id } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("guestlists.manage")
  const [{ data: list }, { data: entries }] = await Promise.all([
    ctx.supabase.from("guest_lists").select("*, events(title, starts_at), artists(name)").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("guest_entries").select("id, name, email, added_via, submitted_by, created_at, tickets(code, status), guest_checkins(event_id, checked_in_at)").eq("list_id", id).order("name"),
  ])
  if (!list) notFound()
  const link = list.link_token ? siteUrl(ctx.org.slug, `/g/${list.link_token}`) : null
  const checkedIn = (e: NonNullable<typeof entries>[number]) =>
    list.event_id ? e.guest_checkins.find((c) => c.event_id === list.event_id) : e.guest_checkins.at(-1)
  const editing = canManage && param(sp, "edit") === "1"

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="grid gap-1">
        <Link href={`/guestlists${list.event_id ? `?event=${list.event_id}` : ""}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {t("guestlists.title")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold">{list.name}</h1>
          {canManage && (
            <Button render={<Link href={withParams(sp, { edit: "1" })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
              {t("guestlists.settings")}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {list.events ? `${list.events.title} · ${t.date(list.events.starts_at, { dateStyle: "medium", timeStyle: "short" })}` : t("guestlists.permanentHint")}
          {list.artists?.name && ` · ${list.artists.name}`}
          {" · "}
          {list.door_price ? t("guestlists.atDoor", { price: t.money(list.door_price) }) : t("guestlists.free")}
          {list.ticket_type_id && ` · ${t("guestlists.withTickets")}`}
        </p>
      </div>
      <Notice error={!editing ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      <section className="grid gap-3 rounded-lg border p-4" aria-labelledby="link">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="link" className="font-medium">
            {t("guestlists.publicLink")}
          </h2>
          <Badge variant={list.link_enabled ? "default" : "secondary"}>{list.link_enabled ? t("guestlists.linkOn") : t("guestlists.linkOff")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("guestlists.linkHint", { count: list.per_submission })}</p>
        {link && list.link_enabled && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm break-all underline underline-offset-4">
            {link} <ExternalLinkIcon className="size-3.5 shrink-0" />
          </a>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {(["on", "off", "renew"] as const)
              .filter((w) => (w === "on" ? !list.link_enabled : w === "off" ? list.link_enabled : true))
              .map((w) => (
                <form key={w} action={setLink}>
                  <input type="hidden" name="id" value={list.id} />
                  <input type="hidden" name="link" value={w} />
                  <SubmitButton size="sm" variant={w === "on" ? "default" : "outline"}>
                    {t.dynamic(`guestlists.linkAction.${w}`)}
                  </SubmitButton>
                </form>
              ))}
          </div>
        )}
      </section>

      {canManage && (
        <form action={addEntries} className="grid gap-2">
          <input type="hidden" name="id" value={list.id} />
          <Label htmlFor="names">{t("guestlists.addNames")}</Label>
          <textarea id="names" name="names" rows={3} className={textarea} placeholder={t("guestlists.namesPlaceholder")} />
          <SubmitButton size="sm" className="justify-self-start">
            {t("guestlists.add")}
          </SubmitButton>
        </form>
      )}

      <section className="grid gap-3" aria-labelledby="entries">
        <h2 id="entries" className="font-medium">
          {t("guestlists.entriesTitle", { count: entries?.length ?? 0 })}
          {list.quota ? ` / ${list.quota}` : ""}
        </h2>
        <DataTable
          rows={entries ?? []}
          rowKey={(e) => e.id}
          empty={t("guestlists.noEntries")}
          columns={[
            {
              header: t("guestlists.guest"),
              cell: (e) =>
                canManage ? (
                  <form action={renameEntry} className="flex gap-1">
                    <input type="hidden" name="id" value={list.id} />
                    <input type="hidden" name="entry" value={e.id} />
                    <Input name="name" defaultValue={e.name} aria-label={t("guestlists.guest")} maxLength={200} className="h-7 min-w-36" />
                    <SubmitButton size="sm" variant="ghost">
                      {t("common.save")}
                    </SubmitButton>
                  </form>
                ) : (
                  e.name
                ),
            },
            {
              header: t("guestlists.via"),
              cell: (e) => <span className="text-xs text-muted-foreground">{e.added_via === "link" ? t("guestlists.viaLink", { name: e.submitted_by ?? "–" }) : t("guestlists.viaApp")}</span>,
            },
            { header: t("guestlists.ticket"), cell: (e) => (e.tickets ? <span className="font-mono text-xs">{e.tickets.code}</span> : null) },
            {
              header: t("guestlists.checkedIn"),
              cell: (e) => {
                const c = checkedIn(e)
                return c ? <Badge>{t.date(c.checked_in_at, { timeStyle: "short" })}</Badge> : null
              },
            },
            {
              header: "",
              cell: (e) =>
                canManage ? (
                  <form action={removeEntry}>
                    <input type="hidden" name="id" value={list.id} />
                    <input type="hidden" name="entry" value={e.id} />
                    <SubmitButton size="icon-sm" variant="ghost" aria-label={t("guestlists.remove")}>
                      <Trash2Icon />
                    </SubmitButton>
                  </form>
                ) : null,
            },
          ]}
        />
      </section>

      {editing && (
        <UrlSheet params={["edit"]} title={list.name}>
          <Notice error={param(sp, "error")} />
          <ListForm eventId={list.event_id} list={list} />
          <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
            <h3 className="font-medium text-destructive">{t("admin.dangerZone")}</h3>
            <form action={trashList}>
              <input type="hidden" name="id" value={list.id} />
              <SubmitButton variant="outline" size="sm">
                {t("guestlists.trash")}
              </SubmitButton>
            </form>
          </section>
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
