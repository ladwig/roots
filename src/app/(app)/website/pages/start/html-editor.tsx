"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"

// Click-to-insert snippets for the start page template (same placeholders as src/site/template.ts).
const START: { key: string; code: string }[] = [
  { key: "name", code: "{{org.name}}" },
  { key: "tagline", code: "{{org.tagline}}" },
  { key: "logo", code: '<img src="{{org.logo}}" alt="{{org.name}}">' },
  { key: "events", code: '{{#events}}\n  <a class="event" href="{{url}}">\n    <img src="{{image}}" alt="">\n    <strong>{{title}}</strong> {{date_short}} · {{time}} · {{venue}}\n  </a>\n{{/events}}\n{{^events}}<p>Gerade keine Events geplant.</p>{{/events}}' },
  { key: "next", code: '{{#next}}<a href="{{url}}">Nächstes Event: {{title}} am {{date}}</a>{{/next}}' },
  { key: "forms", code: '{{#forms}}<a href="{{url}}">{{title}}</a>{{/forms}}' },
  { key: "portal", code: '{{#portal}}<a href="{{url}}">Mitgliederbereich</a>{{/portal}}' },
  { key: "wiki", code: '{{#wiki}}<a href="{{url}}">{{title}}</a>{{/wiki}}' },
]


// Event page template: the event's data and roots' fixed blocks.
const EVENT: { key: string; code: string }[] = [
  { key: "eventTitle", code: "<h1>{{event.title}}</h1>" },
  { key: "eventWhen", code: "<p>{{event.date}} · {{event.time}}{{#event.venue}} · {{event.venue}}{{/event.venue}}</p>" },
  { key: "eventImage", code: '{{#event.image}}<img src="{{event.image}}" alt="">{{/event.image}}' },
  { key: "eventAbout", code: '{{#event.description}}<p style="white-space:pre-line">{{event.description}}</p>{{/event.description}}' },
  { key: "tickets", code: "{{tickets}}" },
  { key: "timetable", code: "{{timetable}}" },
  { key: "back", code: '<a href="{{org.url}}">← {{org.name}}</a>' },
]

/** A template field with its placeholder list; clicking a placeholder inserts its snippet at the cursor. */
export function HtmlEditor({ name = "home_html", kind = "start", defaultValue }: { name?: string; kind?: "start" | "event"; defaultValue: string }) {
  const SNIPPETS = kind === "event" ? EVENT : START
  const t = useT()
  const ref = useRef<HTMLTextAreaElement>(null)
  const insert = (code: string) => {
    const el = ref.current
    if (!el) return
    el.setRangeText(code, el.selectionStart, el.selectionEnd, "end")
    el.focus()
    el.dispatchEvent(new Event("input", { bubbles: true })) // the save bar sees the change
  }
  return (
    <div className="grid gap-3">
      <Textarea ref={ref} name={name} defaultValue={defaultValue} rows={22} maxLength={100000} spellCheck={false} className="font-mono text-xs" aria-label={t("website.html.label")} />
      <div className="grid gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("website.html.insert")}</p>
        <div className="flex flex-wrap gap-1.5">
          {SNIPPETS.map((s) => (
            <Button key={s.key} type="button" variant="outline" size="xs" onClick={() => insert(s.code)}>
              {t.dynamic(`website.html.snippets.${s.key}`)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{kind === "event" ? t("website.event.fields") : t("website.html.fields")}</p>
      </div>
    </div>
  )
}
