import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import type { SelfShift } from "@/shifts/server"

// What a team member sees about themselves ("Meine Schichten"). `action` handles apply / withdraw / check_in / check_out.
export async function ShiftSelfView({
  data,
  action,
  hidden = {},
}: {
  data: { me: { name: string; target_hours: number | null }; own: SelfShift[]; openShifts: SelfShift[]; hours: number }
  action: (fd: FormData) => Promise<void>
  hidden?: Record<string, string>
}) {
  const t = await getT()
  const now = new Date().getTime()
  const when = (s: SelfShift) =>
    `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const what = (s: SelfShift) => [s.position ?? s.title, s.event, s.location].filter(Boolean).join(" · ")
  const button = (s: SelfShift, act: string, label: string, variant: "default" | "outline" = "default") => (
    <form action={action}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="shift" value={s.id} />
      <input type="hidden" name="action" value={act} />
      <SubmitButton size="sm" variant={variant}>
        {label}
      </SubmitButton>
    </form>
  )
  const running = (s: SelfShift) => now >= new Date(s.starts_at).getTime() - 2 * 3600_000 && now <= new Date(s.ends_at).getTime() + 2 * 3600_000

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        {t("shifts.selfHours", { hours: t.number(data.hours, { maximumFractionDigits: 1 }) })}
        {data.me.target_hours != null && ` · ${t("shifts.selfTarget", { hours: t.number(Number(data.me.target_hours)) })}`}
      </p>
      <section className="grid gap-2" aria-labelledby="mine">
        <h2 id="mine" className="font-medium">
          {t("shifts.myShifts")}
        </h2>
        {data.own.length === 0 && <p className="text-sm text-muted-foreground">{t("shifts.noOwn")}</p>}
        <ul className="grid gap-2">
          {data.own.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="grid">
                <span className="font-medium">{what(s)}</span>
                <span className="text-muted-foreground">{when(s)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {s.status === "applied" ? (
                  <>
                    <Badge variant="outline">{t("shifts.applied")}</Badge>
                    {button(s, "withdraw", t("shifts.withdraw"), "outline")}
                  </>
                ) : s.checked_out_at ? (
                  <Badge variant="secondary">{t("shifts.done.check_out")}</Badge>
                ) : s.checked_in_at ? (
                  button(s, "check_out", t("shifts.checkOut"))
                ) : running(s) ? (
                  button(s, "check_in", t("shifts.checkIn"))
                ) : (
                  <Badge>{t("shifts.confirmed")}</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2" aria-labelledby="open">
        <h2 id="open" className="font-medium">
          {t("shifts.openShifts")}
        </h2>
        {data.openShifts.length === 0 && <p className="text-sm text-muted-foreground">{t("shifts.noOpen")}</p>}
        <ul className="grid gap-2">
          {data.openShifts.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span className="grid">
                <span className="font-medium">{what(s)}</span>
                <span className="text-muted-foreground">
                  {when(s)} · {t("shifts.free", { count: s.free ?? 0 })}
                </span>
              </span>
              {button(s, "apply", t("shifts.apply"), "outline")}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
