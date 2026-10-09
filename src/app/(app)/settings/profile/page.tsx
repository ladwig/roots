import { ProfileForms } from "@/app/account/profile-forms"

export default async function ProfileSettings({ searchParams }: PageProps<"/settings/profile">) {
  return <ProfileForms sp={await searchParams} path="/settings/profile" />
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
