"use client"

import { createContext, useContext, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { localeNames, locales, type Locale, type Messages } from "./config"
import { setLocale } from "./actions"
import { createT, type T } from "./translate"

const I18n = createContext<T | null>(null)

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const t = useMemo(() => createT(locale, messages), [locale, messages])
  return <I18n value={t}>{children}</I18n>
}

export function useT() {
  const t = useContext(I18n)
  if (!t) throw new Error("useT() needs <I18nProvider>")
  return t
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <NativeSelect
      aria-label={t("common.language")}
      value={t.locale}
      disabled={pending}
      size="sm"
      className={className}
      onChange={(e) =>
        start(async () => {
          await setLocale(e.target.value)
          router.refresh()
        })
      }
    >
      {locales.map((l) => (
        <NativeSelectOption key={l} value={l}>
          {localeNames[l]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
