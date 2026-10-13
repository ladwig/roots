import { qrSvg } from "@/tickets/server"

// The member card's QR (door scanner reads it). Generated on our server from the code alone; white on purpose
// (scanners need dark-on-light).
export async function MemberQr({ code, label }: { code: string; label: string }) {
  const svg = await qrSvg(code)
  return (
    <div className="grid justify-items-center gap-1">
      <div className="size-36 rounded-lg bg-white p-2 [&_svg]:size-full" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="font-mono text-sm tracking-widest">{code}</p>
    </div>
  )
}
