import { redirect } from "next/navigation"
import { connection } from "next/server"
import { BotIcon } from "lucide-react"
import { Choice } from "@/components/choice"
import { SubmitButton } from "@/components/submit-button"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { createClient } from "@/lib/supabase/server"
import { param, type SearchParams } from "@/lib/url"
import { decide } from "./actions"

// Supabase Auth sends the browser here (?authorization_id=…) when an AI app (Claude …) wants to connect to roots.
// Signed-out visitors are sent to /login first by the proxy and come back. Already approved → straight back.
export default async function ConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const sp = await searchParams
  const t = await getT()
  const id = param(sp, "authorization_id") ?? ""
  const supabase = await createClient()
  const { data: details, error } = id ? await supabase.auth.oauth.getAuthorizationDetails(id) : { data: null, error: true }
  if (details && !("authorization_id" in details)) redirect(details.redirect_url)
  const { data: claims } = await supabase.auth.getClaims()
  const { data: orgs } = await supabase.from("org_members").select("org_id, orgs(name, deleted_at, allow_ai)").eq("user_id", claims?.claims?.sub ?? "")
  const live = (orgs ?? []).filter((o) => o.orgs && !o.orgs.deleted_at && o.orgs.allow_ai)
  const host = details && "redirect_uri" in details ? new URL(details.redirect_uri).host : ""

  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-16">
      <header className="grid justify-items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <BotIcon className="size-6" />
        </span>
        <h1 className="font-heading text-2xl font-semibold">{details && "client" in details ? t("oauth.title", { app: details.client.name }) : t("oauth.titleUnknown")}</h1>
        {host && <p className="text-sm text-muted-foreground">{t("oauth.returnsTo", { host })}</p>}
      </header>
      {error || !details || !("client" in details) ? (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">{t("oauth.invalid")}</p>
      ) : !live.length ? (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">{t("oauth.noOrg")}</p>
      ) : (
        <form action={decide} className="grid gap-5 rounded-xl border bg-card p-5">
          <input type="hidden" name="authorization_id" value={id} />
          {param(sp, "error") && <p className="text-sm text-destructive">{t("oauth.failed")}</p>}
          <p className="text-sm text-muted-foreground">{t("oauth.intro", { app: details.client.name })}</p>
          <div className="grid gap-2">
            <Label htmlFor="c-org">{t("oauth.org")}</Label>
            <Choice id="c-org" name="org_id" label={t("oauth.org")} required defaultValue={live[0].org_id} options={live.map((o) => ({ value: o.org_id, label: o.orgs!.name }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-access">{t("oauth.access")}</Label>
            <Choice id="c-access" name="access" label={t("oauth.access")} required defaultValue="me" options={[{ value: "me", label: t("oauth.accessMe") }, { value: "read", label: t("oauth.accessRead") }]} />
            <p className="text-xs text-muted-foreground">{t("oauth.accessHint")}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <SubmitButton name="decision" value="deny" variant="ghost" formNoValidate>
              {t("oauth.deny")}
            </SubmitButton>
            <SubmitButton name="decision" value="approve">
              {t("oauth.approve")}
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">{t("oauth.revokeHint")}</p>
        </form>
      )}
    </main>
  )
}
