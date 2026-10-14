// Portal sections, one per module. A section is a server component that shows (and lets the person change) what
// the module knows about them; it must only read rows of `contact.id` in `orgId`. Shown when the module is on.
import type { ComponentType } from "react"
import { MembersSection } from "./sections/members"
import { WikiSection } from "./sections/wiki"

export type PortalContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; street: string | null; postal_code: string | null; city: string | null }
export type SectionProps = { orgId: string; orgName: string; site: string; contact: PortalContact; tab: string }

// Each section brings its tabs (bottom bar of the member area, ?tab=<key>, the first one opens by default) and renders
// the one that's open. Labels are message keys, icons lucide names.
export const PORTAL_SECTIONS: { module: string; Section: ComponentType<SectionProps>; tabs: { key: string; label: string; icon: "card" | "member" | "dues" | "user" | "book" }[] }[] = [
  {
    module: "members",
    Section: MembersSection,
    tabs: [
      { key: "card", label: "portal.tabs.card", icon: "card" },
      { key: "membership", label: "portal.tabs.membership", icon: "member" },
      { key: "dues", label: "portal.tabs.dues", icon: "dues" },
      { key: "data", label: "portal.tabs.data", icon: "user" },
    ],
  },
  { module: "wiki", Section: WikiSection, tabs: [{ key: "wiki", label: "portal.tabs.wiki", icon: "book" }] },
]
