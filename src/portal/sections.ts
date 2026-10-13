// Portal sections, one per module. A section is a server component that shows (and lets the person change) what
// the module knows about them; it must only read rows of `contact.id` in `orgId`. Shown when the module is on.
import type { ComponentType } from "react"
import { MembersSection } from "./sections/members"
import { WikiSection } from "./sections/wiki"

export type PortalContact = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; street: string | null; postal_code: string | null; city: string | null }
export type SectionProps = { orgId: string; orgName: string; site: string; contact: PortalContact }

export const PORTAL_SECTIONS: { module: string; Section: ComponentType<SectionProps> }[] = [
  { module: "members", Section: MembersSection },
  { module: "wiki", Section: WikiSection },
]
