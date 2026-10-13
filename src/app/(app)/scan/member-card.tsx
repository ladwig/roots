import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"
import { cn } from "@/lib/utils"
import type { MemberAtDoor } from "@/members/door"

// What the door needs to know about a member: who, status, pause, overdue dues, visits. Used by the scanner (client)
// and the Mitglieder tab (server); `children` = the let-in button.
export function MemberCard({ t, m, children }: { t: T; m: MemberAtDoor; children?: React.ReactNode }) {
  const warn = m.state !== "active" || m.paused || !!m.overdue_count || m.result === "full" || m.result === "not_member"
  const tone = m.result === "ok" ? "border-primary bg-primary/15" : m.result === "already" ? "border-border bg-muted" : warn ? "border-destructive bg-destructive/10" : "border-primary/60"
  return (
    <div role="status" aria-live="assertive" className={cn("grid gap-2 rounded-xl border-2 p-4", tone)}>
      <p className="text-2xl font-semibold">{t.dynamic(`door.member.${m.result}`)}</p>
      <p className="text-lg font-medium break-words">{m.name}</p>
      {m.membership_id && (
        <p className="text-sm text-muted-foreground">{[m.member_no && t("membership.numberShort", { number: m.member_no }), m.type].filter(Boolean).join(" · ")}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {m.state && m.state !== "none" && (
          <Badge variant={m.state === "active" ? "default" : "destructive"}>
            {m.state === "active" && m.ends_on
              ? t("membership.state.ending", { date: t.date(m.ends_on) })
              : t.dynamic(`door.member.state.${m.state}`)}
          </Badge>
        )}
        {m.paused && (
          <Badge variant="destructive">{m.paused_until ? t("membership.state.pausedUntil", { date: t.date(m.paused_until) }) : t("membership.state.paused")}</Badge>
        )}
        {!!m.overdue_count && <Badge variant="destructive">{t("door.member.overdue", { count: m.overdue_count, amount: t.money(m.overdue_cents ?? 0) })}</Badge>}
        {m.membership_id && <Badge variant="outline">{t("door.member.visits", { count: m.visits ?? 0 })}</Badge>}
      </div>
      {m.result === "already" && m.checked_in_at && <p className="text-sm">{t("door.inSince", { time: t.date(m.checked_in_at, { timeStyle: "short" }) })}</p>}
      {m.result === "member" && m.last_visit && <p className="text-sm text-muted-foreground">{t("door.member.lastVisit", { date: t.date(m.last_visit, { dateStyle: "medium" }) })}</p>}
      {m.result === "member" && children}
    </div>
  )
}
