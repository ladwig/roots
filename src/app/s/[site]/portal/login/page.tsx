import { notFound } from "next/navigation"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { getSite } from "../../data"
import { confirmLogin } from "../actions"

// Landing page of the login link. A button signs in (not the GET), so link scanners in mail systems can't use it up.
export default async function PortalLogin({ params, searchParams }: PageProps<"/s/[site]/portal/login">) {
  const { site } = await params
  const token = String((await searchParams).token ?? "")
  const s = await getSite(site)
  if (!s) notFound()
  const t = await getT()
  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-16">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{s.org.name}</p>
        <h1 className="font-heading text-2xl font-semibold">{t("portal.title")}</h1>
      </header>
      <form action={confirmLogin}>
        <input type="hidden" name="site" value={site} />
        <input type="hidden" name="token" value={token} />
        <SubmitButton>{t("portal.signInNow")}</SubmitButton>
      </form>
    </main>
  )
}

export const instant = false
