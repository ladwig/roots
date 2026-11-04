"use client"

import "./globals.css"
import { useEffect, useState } from "react"
import { THEME_SCRIPT } from "@/components/theme-switch"
import type de from "@/i18n/messages/de.json"

type Texts = (typeof de)["errors"]["page"]

// The root layout itself failed: no I18nProvider, no fonts, own document. The texts of the browser's language load
// only now, so the prerendered page (no navigator there) and the first client render match.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const [page, setPage] = useState<Texts | null>(null)
  useEffect(() => {
    const en = navigator.language.startsWith("en")
    document.documentElement.lang = en ? "en" : "de"
    ;(en ? import("@/i18n/messages/en.json") : import("@/i18n/messages/de.json")).then((m) => setPage(m.default.errors.page))
  }, [])
  return (
    <html suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {page && <title>{page.errorTitle}</title>}
      </head>
      <body className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        {page && (
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <p className="font-medium">{page.errorTitle}</p>
            <p className="text-sm text-muted-foreground">{page.errorText}</p>
            <button type="button" onClick={() => retry()} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
              {page.retry}
            </button>
          </div>
        )}
      </body>
    </html>
  )
}
