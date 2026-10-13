// Automations: the workflow graph (React Flow's shape: nodes with id/type/position/data, edges source→target),
// the node catalog, validation and walking the graph. Pure (node --test: graph.test.mjs); the canvas, the server
// actions, the API and the worker all use it, and export/import is just this JSON.
import { z } from "zod"
import { berlinDay, resolveDate } from "./schedule.ts"

export const ACTIONS = ["send_email", "add_tag", "remove_tag", "set_field", "create_record", "notify_team", "telegram", "webhook"] as const
export const NODE_TYPES = ["trigger", "condition", "wait", ...ACTIONS] as const
export type NodeType = (typeof NODE_TYPES)[number]
export const OPS = ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "empty", "not_empty"] as const
export const WAIT_UNITS = ["minutes", "hours", "days"] as const

const text = (max: number) => z.string().max(max)
// What each node type stores in `data` (also what the inspector edits and the API accepts).
export const NODE_DATA = {
  trigger: z.object({
    event: text(100), // hub event, "record:<table>:<action>" or "schedule"
    fields: z.array(text(100)).max(50).optional(), // record changed → only when one of these changed
    // schedule: when, and optionally for each record of an object (filtered by rules and/or a date field)
    every: z.enum(["day", "week", "month"]).optional(),
    time: text(5).optional(),
    weekday: z.number().int().min(1).max(7).optional(),
    monthday: z.number().int().min(1).max(28).optional(),
    object: text(40).optional(),
    rules: z.array(z.object({ field: text(100), op: z.enum(OPS), value: text(500).default("") })).max(20).optional(),
    date_field: text(100).optional(),
    offset: z.number().int().min(-3650).max(3650).optional(), // days: negative = before the date
    yearly: z.boolean().optional(),
  }),
  condition: z.object({
    match: z.enum(["all", "any"]).default("all"),
    rules: z.array(z.object({ field: text(100), op: z.enum(OPS), value: text(500).default("") })).max(20),
  }),
  wait: z.object({ amount: z.number().int().min(1).max(100_000), unit: z.enum(WAIT_UNITS) }),
  send_email: z.object({ to: text(320).default("{contact.email}"), subject: text(200), body: text(100_000) }), // to: an address or a placeholder
  add_tag: z.object({ tag: text(40) }),
  remove_tag: z.object({ tag: text(40) }),
  set_field: z.object({ field: text(100), value: text(2000) }),
  webhook: z.object({ url: text(2000) }),
  notify_team: z.object({ text: text(500) }),
  telegram: z.object({ chat_id: text(40), text: text(4000) }),
  create_record: z.object({ object: text(40), values: z.record(z.string().max(100), text(2000)).default({}) }),
} satisfies Record<NodeType, z.ZodType>
export type NodeData<T extends NodeType> = z.infer<(typeof NODE_DATA)[T]>

export const Graph = z.object({
  nodes: z
    .array(
      z.object({
        id: text(64),
        type: z.enum(NODE_TYPES),
        position: z.object({ x: z.number(), y: z.number() }),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .max(200),
  edges: z.array(z.object({ id: text(64), source: text(64), target: text(64), sourceHandle: z.enum(["yes", "no"]).nullish() })).max(400),
})
export type Graph = z.infer<typeof Graph>
export type GraphNode = Graph["nodes"][number]

/** Problems as message keys (`automations.problems.<key>`) + node id; empty = can be activated. */
export function validate(g: Graph): { key: string; node?: string }[] {
  const out: { key: string; node?: string }[] = []
  const ids = new Set(g.nodes.map((n) => n.id))
  if (ids.size !== g.nodes.length) out.push({ key: "duplicateIds" })
  const triggers = g.nodes.filter((n) => n.type === "trigger")
  if (triggers.length !== 1) out.push({ key: triggers.length ? "oneTrigger" : "noTrigger" })
  for (const n of g.nodes) {
    const data = NODE_DATA[n.type].safeParse(n.data)
    if (!data.success || !filled(n.type, data.data)) out.push({ key: "incomplete", node: n.id })
    const outs = g.edges.filter((e) => e.source === n.id)
    if (n.type === "condition") {
      if (outs.some((e) => !e.sourceHandle) || new Set(outs.map((e) => e.sourceHandle)).size !== outs.length) out.push({ key: "branches", node: n.id })
    } else if (outs.length > 1) out.push({ key: "oneNext", node: n.id })
    if (g.edges.some((e) => e.target === n.id && n.type === "trigger")) out.push({ key: "intoTrigger", node: n.id })
  }
  if (g.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))) out.push({ key: "danglingEdge" })
  if (triggers.length === 1) {
    const reached = reachable(g, triggers[0].id)
    for (const n of g.nodes) if (!reached.has(n.id)) out.push({ key: "unreachable", node: n.id })
    if (hasCycle(g)) out.push({ key: "cycle" })
    if (!g.edges.some((e) => e.source === triggers[0].id)) out.push({ key: "nothingAfterTrigger" })
  }
  return out
}

// Required values per type (zod allows empty strings so drafts can be saved).
function filled(type: NodeType, d: Record<string, unknown>) {
  switch (type) {
    case "trigger":
      return d.event === "schedule" ? !!d.every && /^\d{2}:\d{2}$/.test(String(d.time ?? "")) : !!d.event
    case "condition":
      return (d.rules as { field: string }[]).length > 0 && (d.rules as { field: string }[]).every((r) => /^[a-z_]+\.[a-z_]/.test(r.field))
    case "send_email":
      return !!d.subject && !!d.body && (!d.to || /^[^@\s{}]+@[^@\s]+\.[^@\s]+$|^\{[a-z_.]+\}$/.test(String(d.to)))
    case "add_tag":
    case "remove_tag":
      return !!d.tag
    case "set_field":
      return /^[a-z_]+\.[a-z_]/.test(String(d.field)) || /^[a-z0-9_]+$/.test(String(d.field)) // "object.field" (or an old custom key)
    case "webhook":
      return /^https:\/\/[^\s]+$/.test(String(d.url))
    case "notify_team":
      return !!d.text
    case "create_record":
      return !!d.object
    case "telegram":
      return /^-?\d+$/.test(String(d.chat_id)) && !!d.text
    default:
      return true
  }
}

function reachable(g: Graph, from: string) {
  const seen = new Set([from])
  const stack = [from]
  while (stack.length) {
    const id = stack.pop()
    for (const e of g.edges)
      if (e.source === id && !seen.has(e.target)) {
        seen.add(e.target)
        stack.push(e.target)
      }
  }
  return seen
}

function hasCycle(g: Graph) {
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    const cyc = g.edges.filter((e) => e.source === id).some((e) => visit(e.target))
    state.set(id, 2)
    return cyc
  }
  return g.nodes.some((n) => visit(n.id))
}

export const triggerOf = (g: Graph) => g.nodes.find((n) => n.type === "trigger")
/** What a run's context calls its trigger: the event, or "schedule:<object>" for schedules over records. */
export const triggerKey = (d: Record<string, unknown> | undefined) => (d?.event === "schedule" ? (d.object ? `schedule:${d.object}` : "schedule") : String(d?.event ?? ""))
/** The node after `id` (for a condition: the yes/no branch); null = end of the flow. */
export function next(g: Graph, id: string, branch?: "yes" | "no") {
  const e = g.edges.find((x) => x.source === id && (branch ? x.sourceHandle === branch : true))
  return e ? (g.nodes.find((n) => n.id === e.target) ?? null) : null
}

// ---------- conditions ----------

/** Value at a dotted path ("contact.city", "payload.title", "contact.custom.level"). Arrays stay arrays. */
export function resolve(ctx: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), ctx)
}

export function test(rule: { field: string; op: (typeof OPS)[number]; value: string }, ctx: Record<string, unknown>): boolean {
  const v = resolve(ctx, rule.field)
  // Dates compare by day; the expected value may be calculated ("today-30", "{event.starts_at}-1w").
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && /^(today|heute|\{|\d{4}-\d{2}-\d{2})/i.test(rule.value.trim())) {
    const want = resolveDate(fill(rule.value, ctx), berlinDay(new Date()))
    const day = v.length > 10 ? berlinDay(new Date(v)) : v.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(want)) return compare(day, want, rule.op)
  }
  const str = (x: unknown) => (x == null ? "" : String(x)).trim().toLowerCase()
  const want = str(rule.value)
  const num = (x: unknown) => Number(String(x ?? "").replace(",", "."))
  switch (rule.op) {
    case "empty":
      return v == null || v === "" || (Array.isArray(v) && !v.length)
    case "not_empty":
      return !(v == null || v === "" || (Array.isArray(v) && !v.length))
    case "eq":
      return Array.isArray(v) ? v.length === 1 && str(v[0]) === want : str(v) === want
    case "neq":
      return !test({ ...rule, op: "eq" }, ctx)
    case "contains":
      return Array.isArray(v) ? v.some((x) => str(x) === want) : str(v).includes(want)
    case "not_contains":
      return !test({ ...rule, op: "contains" }, ctx)
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const [a, b] = Number.isFinite(num(v)) && Number.isFinite(num(rule.value)) && String(v ?? "") !== "" ? [num(v), num(rule.value)] : [str(v), want]
      return rule.op === "gt" ? a > b : rule.op === "gte" ? a >= b : rule.op === "lt" ? a < b : a <= b
    }
  }
}

function compare(a: string, b: string, op: (typeof OPS)[number]) {
  switch (op) {
    case "eq":
      return a === b
    case "neq":
      return a !== b
    case "gt":
      return a > b
    case "gte":
      return a >= b
    case "lt":
      return a < b
    case "lte":
      return a <= b
    default:
      return false
  }
}

export const passes = (d: NodeData<"condition">, ctx: Record<string, unknown>) =>
  d.match === "any" ? d.rules.some((r) => test(r, ctx)) : d.rules.every((r) => test(r, ctx))

export const waitMs = (d: NodeData<"wait">) => d.amount * { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[d.unit]

/** {first_name}, {payload.title}, {contact.city} … in texts of actions. Unknown placeholders stay as they are. */
export const fill = (template: string, ctx: Record<string, unknown>, escape = (s: string) => s) =>
  template.replace(/\{([a-z_][a-z0-9_.]*)\}/gi, (m, key: string) => {
    const short: Record<string, string> = { first_name: "contact.first_name", last_name: "contact.last_name", email: "contact.email", name: "contact.name", org: "org.name" }
    const v = resolve(ctx, short[key] ?? (key.includes(".") ? key : `payload.${key}`))
    return v == null || typeof v === "object" ? m : escape(String(v))
  })

// ---------- test run ----------

export type TraceStep = {
  node: string
  type: NodeType
  branch?: "yes" | "no"
  rules?: { field: string; op: string; expected: string; actual: unknown; ok: boolean }[]
  preview?: Record<string, string> // what the action would do, placeholders filled
  wait?: number // ms the real run would pause here
}

/** Walk the flow with real data without doing anything: path, condition results, filled texts. */
export function simulate(g: Graph, ctx: Record<string, unknown>, maxSteps = 100): TraceStep[] {
  const trace: TraceStep[] = []
  const trigger = triggerOf(g)
  if (!trigger) return trace
  trace.push({ node: trigger.id, type: "trigger" })
  let node = next(g, trigger.id)
  for (let i = 0; node && i < maxSteps; i++) {
    const parsed = NODE_DATA[node.type].safeParse(node.data)
    const d = (parsed.success ? parsed.data : node.data) as Record<string, unknown>
    if (node.type === "condition") {
      const c = d as NodeData<"condition">
      const rules = (c.rules ?? []).map((r) => ({ field: r.field, op: r.op, expected: r.value, actual: resolve(ctx, r.field) ?? null, ok: test(r, ctx) }))
      const yes = c.match === "any" ? rules.some((r) => r.ok) : rules.every((r) => r.ok)
      trace.push({ node: node.id, type: "condition", branch: yes ? "yes" : "no", rules })
      node = next(g, node.id, yes ? "yes" : "no")
      continue
    }
    const step: TraceStep = { node: node.id, type: node.type }
    if (node.type === "wait") step.wait = waitMs(d as NodeData<"wait">)
    else
      step.preview = Object.fromEntries(
        Object.entries(d)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, k === "field" ? String(v) : fill(String(v), ctx)]),
      )
    trace.push(step)
    node = next(g, node.id)
  }
  return trace
}
