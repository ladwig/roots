import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { imageUrl } from "@/lib/images"
import { cn } from "@/lib/utils"

// Round picture for a person or org: the image if there is one, else initials.
export function Picture({ path, name, size, square, className }: { path?: string | null; name: string; size?: "sm" | "default" | "lg"; square?: boolean; className?: string }) {
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")
  return (
    <Avatar size={size} className={cn(square && "rounded-md after:rounded-md", className)}>
      {path && <AvatarImage src={imageUrl(path)} alt="" className={cn(square && "rounded-md object-contain")} />}
      <AvatarFallback className={cn(square && "rounded-md")}>{initials}</AvatarFallback>
    </Avatar>
  )
}
