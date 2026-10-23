"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { checkDomainAction } from "./actions"

/** While the domain waits for DNS: ask every 20 s, show it the moment it's live. */
export function DomainPoller() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(async () => {
      if ((await checkDomainAction().catch(() => null)) !== "pending") router.refresh()
    }, 20_000)
    return () => clearInterval(id)
  }, [router])
  return null
}
