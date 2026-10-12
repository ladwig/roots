import { redirect } from "next/navigation"
import { SubmitButton } from "@/components/submit-button"
import { unsubscribe } from "@/email/server"
import { getT } from "@/i18n/server"

// Unsubscribe link from emails. A button (not the GET itself) unsubscribes, so link scanners can't do it by accident.
export default async function Unsubscribe({ params, searchParams }: PageProps<"/u/[token]">) {
  const { token } = await params
  const done = (await searchParams).done
  const t = await getT()
  async function confirm() {
    "use server"
    const r = await unsubscribe(token)
    redirect(`/u/${token}?done=${r ? "1" : "0"}`)
  }
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold">{t("email.unsubscribeTitle")}</h1>
      {done === "1" ? (
        <p>{t("email.unsubscribed")}</p>
      ) : done === "0" ? (
        <p>{t("email.unsubscribeInvalid")}</p>
      ) : (
        <form action={confirm} className="grid gap-4">
          <p className="text-muted-foreground">{t("email.unsubscribeQuestion")}</p>
          <SubmitButton className="justify-self-start">{t("email.unsubscribeConfirm")}</SubmitButton>
        </form>
      )}
    </main>
  )
}

export const instant = false
