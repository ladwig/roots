import { cookies } from "next/headers"
import { AppSidebar, PageTitle, type Me, type SidebarLink } from "@/components/app-sidebar"
import { Shortcuts } from "@/components/shortcuts"
import { Separator } from "@/components/ui/separator"
import { ConfirmHost } from "@/components/confirm-submit"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { SproutButton, SproutProvider } from "@/components/sprout/context"
import { SproutPanel } from "@/components/sprout/panel"

// The one layout for signed-in areas (App + /admin): sidebar (drawer on phones, icons when collapsed) + top bar + content.
export async function AppShell({
  header,
  groups,
  me,
  title,
  search,
  orgId,
  children,
}: {
  header: React.ReactNode
  groups: { label?: string; items: SidebarLink[] }[]
  me: Me
  title: string
  search?: boolean // ⌘K search over the active org (App only); also turns on Sprout, the assistant panel
  orgId?: string // the active org: Sprout starts fresh (setup, chat) when it changes
  children: React.ReactNode
}) {
  // Open/collapsed is remembered in the sidebar_state cookie (set by the shadcn sidebar).
  const jar = await cookies()
  const open = jar.get("sidebar_state")?.value !== "false"
  return (
    <SproutProvider initial={search ? jar.get("sprout")?.value : undefined}>
    <SidebarProvider defaultOpen={open}>
      <AppSidebar header={header} groups={groups} me={me} search={search} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          {/* Phones: the sidebar is a drawer, so the trigger stays; from md the sidebar's edge toggles it. */}
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 md:hidden" />
          <PageTitle groups={groups} fallback={title} />
          {search && <SproutButton />}
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
          <Shortcuts />
          <ConfirmHost />
        </main>
      </SidebarInset>
      {search && <SproutPanel key={orgId} orgId={orgId ?? ""} />}
    </SidebarProvider>
    </SproutProvider>
  )
}
