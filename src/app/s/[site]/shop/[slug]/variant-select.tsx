"use client"

// The variant dropdown: picking one with its own picture shows it in the gallery (window event "shop:image").
export function VariantSelect({ images, ...props }: React.ComponentProps<"select"> & { images: Record<string, string> }) {
  return (
    <select
      {...props}
      onChange={(e) => {
        const image = images[e.currentTarget.value]
        if (image) window.dispatchEvent(new CustomEvent("shop:image", { detail: image }))
      }}
    />
  )
}
