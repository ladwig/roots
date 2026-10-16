import { CalendarDaysIcon, GanttChartIcon, KanbanSquareIcon, LayoutDashboardIcon, ListIcon } from "lucide-react"
import { Segments } from "@/components/segments"
import type { T } from "@/i18n/translate"
import { withParams, type SearchParams } from "@/lib/url"

const ICONS = { overview: LayoutDashboardIcon, board: KanbanSquareIcon, list: ListIcon, timeline: GanttChartIcon, calendar: CalendarDaysIcon }

/** View switch (?view=…, the first one is the default without a param). */
export function ViewSegments({ t, sp, views, current }: { t: T; sp: SearchParams; views: readonly (keyof typeof ICONS)[]; current: string }) {
  return (
    <Segments
      label={t("projects.view")}
      items={views.map((v, i) => {
        const Icon = ICONS[v]
        return {
          href: withParams(sp, { view: i === 0 ? undefined : v, task: undefined, cal: undefined }),
          current: current === v,
          label: (
            <>
              <Icon /> <span className="max-sm:sr-only">{t.dynamic(`projects.views.${v}`)}</span>
            </>
          ),
        }
      })}
    />
  )
}
