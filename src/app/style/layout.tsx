import type { Metadata } from "next"

// Internal design reference (app + website). English only, not translated, not indexed.
export const metadata: Metadata = { title: "roots – Style", robots: { index: false, follow: false } }

export default function StyleLayout({ children }: { children: React.ReactNode }) {
  return children
}
