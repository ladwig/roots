import { PROVIDERS, type Provider } from "@/assistant/providers"
import { cn } from "@/lib/utils"

/** A provider's logo (public/brands): coloured as is, or monochrome logos drawn in the text colour (dark mode). */
export function ProviderLogo({ provider, className }: { provider: Provider; className?: string }) {
  const p = PROVIDERS[provider]
  return p.tint ? (
    <span aria-hidden className={cn("inline-block size-4 shrink-0 bg-current", className)} style={{ mask: `url(${p.logo}) center / contain no-repeat`, WebkitMask: `url(${p.logo}) center / contain no-repeat` }} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.logo} alt="" aria-hidden className={cn("size-4 shrink-0", className)} />
  )
}
