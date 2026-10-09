import { Skeleton } from "@/components/ui/skeleton"

// Shown instantly on navigation (loading.tsx) while the server renders the page.
export function PageSkeleton() {
  return (
    <div className="grid max-w-5xl gap-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-full sm:w-64" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
