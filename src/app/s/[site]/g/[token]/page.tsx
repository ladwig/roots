import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { param } from "@/lib/url"
import { getSite } from "../../data"
import { signUp } from "./actions"

// Magic link of a guest list: enter your name and your friends' names. Shows no names of others, only what's left.
export default async function GuestLink({ params, searchParams }: PageProps<"/s/[site]/g/[token]">) {
  const { site, token } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const { data: info } = await s.db.rpc("guest_link_info", { p_token: token }).maybeSingle()
  if (!info) notFound()
  const t = await getT()
  const slots = Math.min(info.per_submission, info.remaining ?? info.per_submission)

  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{info.org_name}</p>
        <h1 className="font-heading text-2xl font-semibold">{info.list_name}</h1>
        {info.event_title && (
          <p className="text-muted-foreground">
            {info.event_title}
            {info.starts_at && ` · ${t.date(info.starts_at, { dateStyle: "full", timeStyle: "short" })}`}
          </p>
        )}
      </header>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {!info.open ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("guestlists.closed")}</p>
      ) : slots === 0 ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("guestlists.full")}</p>
      ) : (
        <form action={signUp} className="grid gap-4">
          <input type="hidden" name="site" value={site} />
          <input type="hidden" name="token" value={token} />
          <div className="grid gap-2">
            <Label htmlFor="by">{t("guestlists.yourName")}</Label>
            <Input id="by" name="by" required maxLength={200} autoComplete="name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{t("guestlists.yourEmail")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("guestlists.whoComes", { count: slots })}</legend>
            {Array.from({ length: slots }, (_, i) => (
              <Input key={i} name="name" maxLength={200} aria-label={t("guestlists.guestN", { n: i + 1 })} placeholder={t("guestlists.guestN", { n: i + 1 })} autoComplete="off" />
            ))}
          </fieldset>
          {info.remaining != null && <p className="text-xs text-muted-foreground">{t("guestlists.left", { count: info.remaining })}</p>}
          <SubmitButton className="justify-self-start">{t("guestlists.submit")}</SubmitButton>
        </form>
      )}
    </main>
  )
}

export const instant = false
