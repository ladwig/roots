"use client"

import { useEffect } from "react"
import { toast } from "sonner"

// Shows an action result as a toast (<Toaster> sits in the root layout) and renders nothing.
// `?ok=` / `?error=` from back() are removed from the URL afterwards, so reload/share doesn't repeat them.
export function Notice({ error, ok }: { error?: string; ok?: string; className?: string }) {
  useEffect(() => {
    if (error) toast.error(error, { id: error, duration: 8000 })
    else if (ok) toast.success(ok, { id: ok })
    else return
    const url = new URL(window.location.href)
    if (url.searchParams.has("error") || url.searchParams.has("ok")) {
      url.searchParams.delete("error")
      url.searchParams.delete("ok")
      window.history.replaceState(window.history.state, "", url)
    }
  }, [error, ok])
  return null
}
