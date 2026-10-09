"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"
import { TEMPLATES } from "@/documents/templates"

// Toolbar above the paper (hidden when printing): template + "print / save as PDF".
export function PrintBar({ template, filename }: { template: string; filename: string }) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    document.title = filename // browsers use it as the PDF file name
  }, [filename])
  return (
    <div className="print-hide mx-auto mb-4 flex w-[210mm] max-w-full flex-wrap items-center justify-between gap-3 px-4">
      <NativeSelect
        aria-label={t("invoices.template")}
        value={template}
        onChange={(e) => router.replace(`${pathname}?template=${e.target.value}`)}
        className="w-48"
      >
        {TEMPLATES.map((x) => (
          <NativeSelectOption key={x} value={x}>
            {t.dynamic(`invoices.templates.${x}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button type="button" onClick={() => window.print()}>
        <PrinterIcon /> {t("invoices.print")}
      </Button>
    </div>
  )
}
