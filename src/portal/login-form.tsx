import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requestLink } from "@/app/s/[site]/portal/actions"

/** Email → sign-in link for the member area. Used by /portal and the website's member-area block. */
export async function PortalLoginForm({ site, id = "p-email" }: { site: string; id?: string }) {
  const t = await getT()
  return (
    <form action={requestLink} className="grid gap-4">
      <input type="hidden" name="site" value={site} />
      <p className="text-muted-foreground">{t("portal.intro")}</p>
      <div className="grid gap-2">
        <Label htmlFor={id}>{t("portal.email")}</Label>
        <Input id={id} name="email" type="email" required autoComplete="email" />
      </div>
      <SubmitButton className="justify-self-start">{t("portal.sendLink")}</SubmitButton>
    </form>
  )
}
