"use client"

import Link from "next/link"
import { TriangleAlertIcon } from "lucide-react"
import { EmptyState, Page } from "@/components/page"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { APP_HOME } from "@/lib/url"

// A page of the App crashed: the shell stays, the person can retry or go home. The digest matches the server log.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT()
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null
  return (
    <Page>
      <EmptyState
        icon={TriangleAlertIcon}
        title={t("errors.page.errorTitle")}
        text={t("errors.page.errorText")}
        action={
          <div className="grid justify-items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => retry()}>
                {t("errors.page.retry")}
              </Button>
              <Button render={<Link href={APP_HOME} />} nativeButton={false} size="sm" variant="outline">
                {t("errors.page.home")}
              </Button>
            </div>
            {digest && <p className="text-xs text-muted-foreground">{t("errors.page.code", { code: digest })}</p>}
          </div>
        }
      />
    </Page>
  )
}
