import { titled } from "@/lib/title"

export const generateMetadata = titled("sites.nav")

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
