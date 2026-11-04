import Link from "next/link"
import { FileQuestionIcon } from "lucide-react"
import { EmptyState, Page } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { APP_HOME } from "@/lib/url"

// notFound() inside the App (a record that doesn't exist or was purged): the sidebar stays, so the way back is there.
export default async function NotFound() {
  const t = await getT()
  return (
    <Page>
      <EmptyState
        icon={FileQuestionIcon}
        title={t("errors.page.notFoundTitle")}
        text={t("errors.page.notFoundText")}
        action={
          <Button render={<Link href={APP_HOME} />} nativeButton={false} size="sm">
            {t("errors.page.home")}
          </Button>
        }
      />
    </Page>
  )
}
