// Portal sections, one per module. A section is a server component that shows (and lets the person change) what
// the module knows about them; it must only read rows of `contact.id` in `orgId`. Shown when the module is on.
import type { ComponentType } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import { MembersSection } from "./sections/members"
import { hasRentals, RentalsSection } from "./sections/rentals"
import { CoursesSection, hasCourses } from "./sections/courses"
import { hasTickets, TicketsSection } from "./sections/tickets"
import { WikiSection } from "./sections/wiki"

export type PortalContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; street: string | null; postal_code: string | null; city: string | null }
export type SectionProps = { orgId: string; orgName: string; site: string; contact: PortalContact; tab: string }

// Each section brings its tabs (bottom bar of the member area, ?tab=<key>, the first one opens by default) and renders
// the one that's open. Labels are message keys, icons lucide names. `show`: only for people it concerns (a tenant
// without membership sees no member tabs); omitted = everyone signed in.
export const PORTAL_SECTIONS: {
  module: string
  Section: ComponentType<SectionProps>
  tabs: { key: string; label: string; icon: "card" | "member" | "dues" | "user" | "book" | "home" | "ticket" | "course" }[]
  show?: (orgId: string, contactId: string) => Promise<boolean>
}[] = [
  {
    module: "members",
    Section: MembersSection,
    tabs: [
      { key: "card", label: "portal.tabs.card", icon: "card" },
      { key: "membership", label: "portal.tabs.membership", icon: "member" },
      { key: "dues", label: "portal.tabs.dues", icon: "dues" },
      { key: "data", label: "portal.tabs.data", icon: "user" },
    ],
    show: async (orgId, contactId) => {
      const { count } = await createAdminClient().from("memberships").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("contact_id", contactId).is("deleted_at", null)
      return (count ?? 0) > 0
    },
  },
  { module: "tickets", Section: TicketsSection, tabs: [{ key: "tickets", label: "portal.tabs.tickets", icon: "ticket" }], show: hasTickets },
  { module: "courses", Section: CoursesSection, tabs: [{ key: "courses", label: "portal.tabs.courses", icon: "course" }], show: hasCourses },
  { module: "rentals", Section: RentalsSection, tabs: [{ key: "rental", label: "portal.tabs.rental", icon: "home" }], show: hasRentals },
  { module: "wiki", Section: WikiSection, tabs: [{ key: "wiki", label: "portal.tabs.wiki", icon: "book" }] },
]
