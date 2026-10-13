// Ready-made workflows to start from (picked when creating one). Texts come from the messages, so a template
// starts in the user's language; afterwards it's an ordinary workflow.
import type { T } from "@/i18n/translate"
import type { Graph } from "./graph"

type Tpl = { key: string; module?: string; graph: (t: T) => Graph }
const at = (i: number) => ({ x: 0, y: i * 140 })
const node = (id: string, type: Graph["nodes"][number]["type"], i: number, data: Record<string, unknown>) => ({ id, type, position: at(i), data })
const edge = (source: string, target: string, sourceHandle?: "yes" | "no") => ({ id: `${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) })
const mail = (t: T, key: string) => ({ subject: t.dynamic(`automations.templates.${key}.subject`), body: `<p>${t.dynamic(`automations.templates.${key}.body`)}</p>` })

export const TEMPLATES: Tpl[] = [
  {
    key: "welcomeContact",
    module: "crm",
    graph: (t) => ({
      nodes: [node("trigger", "trigger", 0, { event: "contact.created" }), node("wait", "wait", 1, { amount: 1, unit: "hours" }), node("mail", "send_email", 2, mail(t, "welcomeContact"))],
      edges: [edge("trigger", "wait"), edge("wait", "mail")],
    }),
  },
  {
    key: "welcomeMember",
    module: "members",
    graph: (t) => ({
      nodes: [
        node("trigger", "trigger", 0, { event: "membership.started" }),
        node("tag", "add_tag", 1, { tag: t("automations.templates.welcomeMember.tag") }),
        node("mail", "send_email", 2, mail(t, "welcomeMember")),
        node("wait", "wait", 3, { amount: 30, unit: "days" }),
        node("mail2", "send_email", 4, mail(t, "memberCheckIn")),
      ],
      edges: [edge("trigger", "tag"), edge("tag", "mail"), edge("mail", "wait"), edge("wait", "mail2")],
    }),
  },
  {
    key: "missYou",
    module: "members",
    graph: (t) => ({
      nodes: [node("trigger", "trigger", 0, { event: "membership.ended" }), node("wait", "wait", 1, { amount: 60, unit: "days" }), node("mail", "send_email", 2, mail(t, "missYou"))],
      edges: [edge("trigger", "wait"), edge("wait", "mail")],
    }),
  },
  {
    key: "formToTeam",
    module: "forms",
    graph: (t) => ({
      nodes: [node("trigger", "trigger", 0, { event: "form.submitted" }), node("notify", "notify_team", 1, { text: t("automations.templates.formToTeam.message") })],
      edges: [edge("trigger", "notify")],
    }),
  },
  {
    key: "courseMovedUp",
    module: "courses",
    graph: (t) => ({
      nodes: [node("trigger", "trigger", 0, { event: "course.moved_up" }), node("mail", "send_email", 1, mail(t, "courseMovedUp"))],
      edges: [edge("trigger", "mail")],
    }),
  },
  {
    key: "vipBuyer",
    module: "tickets",
    graph: (t) => ({
      nodes: [
        node("trigger", "trigger", 0, { event: "tickets.sold" }),
        node("check", "condition", 1, { match: "all", rules: [{ field: "contact.tags", op: "contains", value: "VIP" }] }),
        node("notify", "notify_team", 2, { text: t("automations.templates.vipBuyer.message") }),
      ],
      edges: [edge("trigger", "check"), edge("check", "notify", "yes")],
    }),
  },
]
