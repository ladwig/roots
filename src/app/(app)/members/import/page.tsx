import { redirect } from "next/navigation"

// The import lives in a drawer on the overview now.
export default function MemberImportPage() {
  redirect("/members?import=1")
}
