"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// While the payment is being confirmed: re-render the page every 3 s (for up to 3 minutes).
export function AutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    let n = 0
    const timer = setInterval(() => (++n > 60 ? clearInterval(timer) : router.refresh()), 3000)
    return () => clearInterval(timer)
  }, [router])
  return null
}
