// The real module UI for website blocks that show it directly (form, ticket shop, member-area sign-in). Same
// components as the event/form/portal pages – one implementation, two places. Server only (public render).
import type { PublicForm } from "@/app/s/[site]/f/[slug]/data"
import { FormRenderer } from "@/app/s/[site]/f/[slug]/form-renderer"
import { TicketShop } from "@/app/s/[site]/e/[slug]/shop"
import { cachedEvent, cachedForm } from "@/lib/public-cache"
import { PortalLoginForm } from "@/portal/login-form"
import type { SiteMeta } from "./blocks"

export function siteEmbeds(site: string, org: { id: string; name: string }): NonNullable<SiteMeta["embed"]> {
  return {
    form: (slug) => <EmbeddedForm site={site} org={org} slug={slug} />,
    tickets: (slug) => <EmbeddedTickets site={site} orgId={org.id} slug={slug} />,
    portal: () => <PortalLoginForm site={site} id="site-portal-email" />,
  }
}

async function EmbeddedForm({ site, org, slug }: { site: string; org: { id: string; name: string }; slug: string }) {
  const form = await cachedForm(org.id, slug)
  return form ? <FormRenderer form={form as unknown as PublicForm} site={site} slug={slug} org={org.name} /> : null
}

async function EmbeddedTickets({ site, orgId, slug }: { site: string; orgId: string; slug: string }) {
  const e = await cachedEvent(orgId, slug)
  return e?.status === "published" ? <TicketShop site={site} slug={slug} eventId={e.id} max={e.max_tickets_per_order} code={null} waitlist={null} /> : null
}
