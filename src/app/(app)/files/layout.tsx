import { titled } from "@/lib/title"

export const generateMetadata = titled("files.title")

// Dateien: the org's files and the letter templates that produce them (sub-items in the sidebar).
export default function FilesLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid max-w-6xl gap-6">{children}</div>
}
