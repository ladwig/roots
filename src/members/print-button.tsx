"use client"

import { PrinterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
      <PrinterIcon /> {label}
    </Button>
  )
}
