"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => toast.success("Saved.")}>
        Success toast
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.error("Something went wrong.")}>
        Error toast
      </Button>
    </div>
  )
}
