// Automations: the workflow graph (React Flow's shape: nodes with id/type/position/data, edges source→target),
// the node catalog, validation and walking the graph. Pure (node --test: graph.test.mjs); the canvas, the server
// actions, the API and the worker all use it, and export/import is just this JSON.
import { z } from "zod"

export const ACTIONS = ["send_email", "add_tag", "remove_tag", "set_field", "webhook", "notify_team"] as const
export const NODE_TYPES = ["trigger", "condition", "wait", ...ACTIONS] as const
export type NodeType = (typeof NODE_TYPES)[number]
export const OPS = ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "empty", "not_empty"] as const
export const WAIT_UNITS = ["minutes", "hours", "days"] as const

const text = (max: number) => z.string().max(max)
// What each node type stores in `data` (also what the inspector edits and the API accepts).
export const NODE_DATA = {
  trigger: z.object({ event: text(100) }),
  condition: z.object({
    match: z.enum(["all", "any"]).default("all"),
    rules: z.array(z.object({ field: text(100), op: z.enum(OPS), value: text(500).default("") })).max(20),
  }),
  wait: z.object({ amount: z.number().int().min(1).max(100_000), unit: z.enum(WAIT_UNITS) }),
  send_email: z.object({ subject: text(200), body: text(100_000) }),
  add_tag: z.object({ tag: text(40) }),
  remove_tag: z.object({ tag: text(40) }),
  set_field: z.object({ field: text(100), value: text(2000) }),
  webhook: z.object({ url: text(2000) }),
  notify_team: z.object({ text: text(500) }),
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
      return !!d.event
    case "condition":
      return (d.rules as { field: string }[]).length > 0 && (d.rules as { field: string }[]).every((r) => /^[a-z_]+\.[a-z_]/.test(r.field))
    case "send_email":
      return !!d.subject && !!d.body
    case "add_tag":
    case "remove_tag":
      return !!d.tag
    case "set_field":
      return /^[a-z_]+\.[a-z_]/.test(String(d.field)) || /^[a-z0-9_]+$/.test(String(d.field)) // "object.field" (or an old custom key)
    case "webhook":
      return /^https:\/\/[^\s]+$/.test(String(d.url))
    case "notify_team":
      return !!d.text
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
