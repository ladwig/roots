"use client"

import { useFormStatus } from "react-dom"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"

// Submit button for every form: disabled with a spinner while its form's server action runs (no double submits).
export function SubmitButton({ children, disabled, ...props }: Omit<React.ComponentProps<typeof Button>, "type">) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} {...props}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      {children}
    </Button>
  )
}
