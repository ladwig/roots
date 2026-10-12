// Device frames for product mocks, drawn in CSS (no screenshots). The content inside is a fake, simplified app.
import { cn } from "@/lib/utils"

export function DeviceBrowser({ url = "app.roots.de", className, children }: { url?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[20px] bg-[#fbf9f4] text-[#0c0d0b] shadow-[0_40px_80px_-30px_rgb(0_0_0/.55),0_0_0_1px_rgb(0_0_0/.06)]", className)}>
      <div className="flex items-center gap-2 border-b border-black/5 bg-[#f1ede4] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff6159]" />
        <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="size-2.5 rounded-full bg-[#28c941]" />
        <span className="mx-auto flex h-6 w-1/2 min-w-0 items-center justify-center rounded-md bg-white/80 px-3 text-[11px] text-black/50">
          <span className="truncate">🔒 {url}</span>
        </span>
      </div>
      {children}
    </div>
  )
}

export function DeviceLaptop({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative", className)}>
      <div className="rounded-[22px] bg-[#1d1f1b] p-[1.6%] shadow-[0_50px_100px_-40px_rgb(0_0_0/.7)] ring-1 ring-white/10">
        <div className="aspect-[16/10] overflow-hidden rounded-[12px] bg-[#fbf9f4] text-[#0c0d0b]">{children}</div>
      </div>
      <div className="mx-[-5%] h-[14px] rounded-b-[18px] bg-gradient-to-b from-[#c9c5bc] to-[#8f8b83] shadow-[0_20px_40px_-15px_rgb(0_0_0/.6)]">
        <div className="mx-auto h-[5px] w-[16%] rounded-b-md bg-black/20" />
      </div>
    </div>
  )
}

export function DevicePhone({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative aspect-[9/19] rounded-[42px] bg-[#16181a] p-[3.5%] shadow-[0_40px_80px_-25px_rgb(0_0_0/.7)] ring-1 ring-white/15 [container-type:inline-size]", className)}>
      {/* Text scales with the phone's width (em inside the mock). */}
      <div className="relative h-full overflow-hidden rounded-[34px] bg-[#fbf9f4] text-[#0c0d0b] text-[clamp(7px,5.2cqi,14px)]">
        <div className="absolute top-[0.6em] left-1/2 z-10 h-[1.7em] w-[34%] -translate-x-1/2 rounded-full bg-[#16181a]" />
        <div className="flex items-center justify-between px-[1.8em] pt-[0.9em] text-[0.8em] font-semibold">
          <span>9:41</span>
          <span className="tracking-tight">●●● ▮</span>
        </div>
        {children}
      </div>
    </div>
  )
}
