"use client"

import { useFormStatus } from "react-dom"
import { Loader2Icon } from "lucide-react"

/** Website-style submit button (pill classes) with a spinner while the server action runs. */
export function SiteSubmit({ children, variant = "solid", className, ...props }: { variant?: "solid" | "outline" } & React.ComponentProps<"button">) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`pill justify-center ${variant === "outline" ? "pill-outline" : ""} ${className ?? ""}`} {...props}>
      {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
      <span>{children}</span>
    </button>
  )
}
