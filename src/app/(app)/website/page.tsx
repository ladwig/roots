import { redirect } from "next/navigation"

// The website is managed entirely in the editor (pages, settings, design).
export default function WebsitePage() {
  redirect("/website/edit")
}
