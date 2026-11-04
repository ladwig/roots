import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { FileQuestionIcon } from "lucide-react"
import { EmptyState } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { APP_HOME } from "@/lib/url"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("errors.page.notFoundTitle") }
}

// Any URL nothing matches. On the bare domain the proxy sends unknown paths into the App, so "home" is the App's start;
// an org site (x-roots-site, set only by the proxy) links to its own start page, which works on every host type.
export default async function NotFound() {
  const t = await getT()
  const site = (await headers()).get("x-roots-site")
  const home = site ? `/s/${site}` : APP_HOME
  return (
    <main className="grid flex-1 place-items-center bg-background px-4 py-16">
      <EmptyState
        icon={FileQuestionIcon}
        title={t("errors.page.notFoundTitle")}
        text={t("errors.page.notFoundText")}
        action={
          <Button render={<Link href={home} />} nativeButton={false} size="sm">
            {t("errors.page.home")}
          </Button>
        }
      />
    </main>
  )
}
