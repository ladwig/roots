import { redirect } from "next/navigation"

// The import lives in a drawer on the overview now.
export default function ContactImportPage() {
  redirect("/contacts?import=1")
}
