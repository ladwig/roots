import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"

// Frame of a "new <record>" page: breadcrumbs back to the list, title, the action's error, the form (FormCards + SaveBar).
export function NewPage({ list, title, error, children }: { list: { href: string; label: string }; title: string; error?: string; children: React.ReactNode }) {
  return (
    <Page size="form">
      <PageHeader crumbs={[list, { label: title }]} title={title} />
      <Notice error={error} />
      {children}
    </Page>
  )
}
