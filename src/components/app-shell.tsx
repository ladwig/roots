import { cookies } from "next/headers"
import { AppSidebar, type Me, type SidebarLink } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// The one layout for signed-in areas (App + /admin): sidebar (drawer on phones, icons when collapsed) + top bar + content.
export async function AppShell({
  header,
  groups,
  me,
  title,
  children,
}: {
  header: React.ReactNode
  groups: { label?: string; items: SidebarLink[] }[]
  me: Me
  title: string
  children: React.ReactNode
}) {
  // Open/collapsed is remembered in the sidebar_state cookie (set by the shadcn sidebar).
  const open = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <SidebarProvider defaultOpen={open}>
      <AppSidebar header={header} groups={groups} me={me} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4" />
          <span className="truncate text-sm font-medium">{title}</span>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
