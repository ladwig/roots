import { cn } from "@/lib/utils"

export function Notice({ error, ok, className }: { error?: string; ok?: string; className?: string }) {
  if (!error && !ok) return null
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted text-foreground",
        className
      )}
    >
      {error ?? ok}
    </p>
  )
}
