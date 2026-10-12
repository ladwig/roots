import { titled } from "@/lib/title"

// Only sets the tab title for the area (sub-pages inherit it).
export const generateMetadata = titled("tickets.scanNav")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
