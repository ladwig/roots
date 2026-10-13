import { Notice } from "@/components/notice"
import { PageCrumbs } from "@/components/page-crumbs"

// Frame of a "new <record>" page: breadcrumbs back to the list, title, the action's error, the form.
export function NewPage({ list, title, error, children }: { list: { href: string; label: string }; title: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid max-w-3xl gap-6">
      <PageCrumbs items={[list, { label: title }]} />
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <Notice error={error} />
      {children}
    </div>
  )
}
