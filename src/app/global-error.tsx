"use client"

import "./globals.css"
import { messages } from "@/i18n/config"
import { THEME_SCRIPT } from "@/components/theme-switch"

// The root layout itself failed: no I18nProvider, no fonts, own document. Kept to a title and a retry button.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const lang = typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "de"
  const page = messages[lang].errors.page
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <title>{page.errorTitle}</title>
      </head>
      <body className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="grid max-w-sm justify-items-center gap-3 text-center">
          <p className="font-medium">{page.errorTitle}</p>
          <p className="text-sm text-muted-foreground">{page.errorText}</p>
          <button type="button" onClick={() => retry()} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
            {page.retry}
          </button>
        </div>
      </body>
    </html>
  )
}
