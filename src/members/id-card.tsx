import type { T } from "@/i18n/translate"
import { qrSvg } from "@/tickets/server"
import { PrintButton } from "./print-button"

// The member card (Mitgliedskarte): credit-card size, shown in the portal (digital, after the email login) and in the
// app; "Drucken" prints only the card. White paper with black text on purpose (printed cards, scanners need
// dark-on-light). The QR holds the card code; the member number works at the door too.
// `large`: the member area's card view (as wide as the screen allows, centred, bigger text) to show at the door.
export async function IdCard({ t, org, name, number, type, code, large, status }: { t: T; org: string; name: string; number: string | null; type: string | null; code: string; large?: boolean; status?: string }) {
  const svg = await qrSvg(code)
  return (
    <div className={`grid gap-3 ${large ? "justify-items-center" : "justify-items-start"}`}>
      <style>{`@media print { body * { visibility: hidden !important } .id-card, .id-card * { visibility: visible !important }
        .id-card { position: fixed !important; left: 0; top: 0; box-shadow: none !important } @page { margin: 10mm } }`}</style>
      <div className={`id-card flex aspect-[85.6/54] max-w-full items-center gap-[4mm] rounded-xl border bg-white p-[4mm] text-black shadow-sm ${large ? "w-[26rem] print:w-[85.6mm]" : "w-[85.6mm]"}`}>
        <div className="aspect-square h-full shrink-0 [&_svg]:size-full" role="img" aria-label={t("membership.cardQr")} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className={`grid min-w-0 gap-1 leading-tight ${large ? "text-base print:text-sm" : "text-sm"}`}>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-xs uppercase tracking-wide opacity-60">{org}</span>
            {status && <span className="shrink-0 rounded-full border border-black/20 px-2 py-0.5 text-[0.65rem] font-medium">{status}</span>}
          </span>
          <span className={`font-semibold break-words ${large ? "text-xl print:text-base" : "text-base"}`}>{name}</span>
          {number && <span>{t("membership.numberShort", { number })}</span>}
          {type && <span className="truncate opacity-70">{type}</span>}
          <span className="font-mono text-[0.65rem] tracking-wider opacity-60">{code}</span>
        </div>
      </div>
      <PrintButton label={t("membership.cardPrint")} />
    </div>
  )
}
