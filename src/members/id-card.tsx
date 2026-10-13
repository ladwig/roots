import type { T } from "@/i18n/translate"
import { qrSvg } from "@/tickets/server"
import { PrintButton } from "./print-button"

// The member card (Mitgliedskarte): credit-card size, shown in the portal (digital, after the email login) and in the
// app; "Drucken" prints only the card. White paper with black text on purpose (printed cards, scanners need
// dark-on-light). The QR holds the card code; the member number works at the door too.
export async function IdCard({ t, org, name, number, type, code }: { t: T; org: string; name: string; number: string | null; type: string | null; code: string }) {
  const svg = await qrSvg(code)
  return (
    <div className="grid justify-items-start gap-3">
      <style>{`@media print { body * { visibility: hidden !important } .id-card, .id-card * { visibility: visible !important }
        .id-card { position: fixed !important; left: 0; top: 0; box-shadow: none !important } @page { margin: 10mm } }`}</style>
      <div className="id-card flex aspect-[85.6/54] w-[85.6mm] max-w-full items-center gap-[4mm] rounded-xl border bg-white p-[4mm] text-black shadow-sm">
        <div className="aspect-square h-full shrink-0 [&_svg]:size-full" role="img" aria-label={t("membership.cardQr")} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="grid min-w-0 gap-1 text-sm leading-tight">
          <span className="truncate text-xs uppercase tracking-wide opacity-60">{org}</span>
          <span className="text-base font-semibold break-words">{name}</span>
          {number && <span>{t("membership.numberShort", { number })}</span>}
          {type && <span className="truncate opacity-70">{type}</span>}
          <span className="font-mono text-[0.65rem] tracking-wider opacity-60">{code}</span>
        </div>
      </div>
      <PrintButton label={t("membership.cardPrint")} />
    </div>
  )
}
