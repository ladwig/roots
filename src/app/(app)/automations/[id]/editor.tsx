"use client"

import "@xyflow/react/dist/style.css"
import { useCallback, useMemo, useState, useTransition } from "react"
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { BellIcon, ClockIcon, DownloadIcon, GitForkIcon, LayoutListIcon, MailIcon, PencilIcon, SaveIcon, TagIcon, TagsIcon, Trash2Icon, WebhookIcon, ZapIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { ACTIONS, OPS, validate, WAIT_UNITS, type Graph, type NodeType } from "@/automations/graph"
import { saveWorkflow } from "../actions"

type Data = Record<string, unknown>
type FlowNode = Node<Data, NodeType>
export type EditorOptions = {
  events: { key: string; label: string }[]
  fields: { value: string; label: string }[] // condition fields (contact.*, custom fields, payload.*)
  customFields: { key: string; label: string }[]
  tags: string[]
}

const ICONS: Record<NodeType, LucideIcon> = {
  trigger: ZapIcon,
  condition: GitForkIcon,
  wait: ClockIcon,
  send_email: MailIcon,
  add_tag: TagIcon,
  remove_tag: TagsIcon,
  set_field: PencilIcon,
  webhook: WebhookIcon,
  notify_team: BellIcon,
}
const DEFAULTS: Record<NodeType, Data> = {
  trigger: { event: "" },
  condition: { match: "all", rules: [{ field: "", op: "eq", value: "" }] },
  wait: { amount: 1, unit: "days" },
  send_email: { subject: "", body: "" },
  add_tag: { tag: "" },
  remove_tag: { tag: "" },
  set_field: { field: "", value: "" },
  webhook: { url: "" },
  notify_team: { text: "" },
}

// One step on the canvas: icon, kind, a one-line summary; conditions have a yes and a no output.
function StepNode({ type, data, selected }: NodeProps<FlowNode>) {
  const t = useT()
  const Icon = ICONS[type]
  const summary = (() => {
    const d = data as Record<string, string | number | { field: string }[]>
    if (type === "trigger") return (d.event as string) ? t.dynamic(`events.types.${d.event}`) : t("automations.pickEvent")
    if (type === "wait") return `${d.amount} ${t.dynamic(`automations.units.${d.unit}`)}`
    if (type === "condition") return ((d.rules as { field: string }[]) ?? []).map((r) => r.field).filter(Boolean).join(", ") || "–"
    return String(d.subject ?? d.tag ?? d.field ?? d.url ?? d.text ?? "") || "–"
  })()
  const problem = Boolean(data.__problem)
  return (
    <div className={cn("w-64 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm", selected && "ring-2 ring-ring", problem && "border-destructive", type === "trigger" && "border-primary")}>
      {type !== "trigger" && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{t.dynamic(`automations.nodes.${type}`)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>
      {type === "condition" ? (
        <>
          <Handle type="source" id="yes" position={Position.Bottom} style={{ left: "30%" }} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: "70%" }} />
          <div className="mt-1 flex justify-between px-[22%] text-[10px] text-muted-foreground">
            <span>{t("automations.yes")}</span>
            <span>{t("automations.no")}</span>
          </div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  )
}
const nodeTypes = Object.fromEntries(["trigger", "condition", "wait", ...ACTIONS].map((k) => [k, StepNode]))

export function WorkflowEditor(props: { id: string; name: string; description: string; graph: Graph; options: EditorOptions; canEdit: boolean }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ id, name: initialName, description: initialDescription, graph, options, canEdit }: { id: string; name: string; description: string; graph: Graph; options: EditorOptions; canEdit: boolean }) {
  const t = useT()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes.map((n) => ({ ...n, data: n.data as Data })) as FlowNode[])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges.map((e) => ({ ...e, sourceHandle: e.sourceHandle ?? null, label: e.sourceHandle ? t(e.sourceHandle === "yes" ? "automations.yes" : "automations.no") : undefined })))
  const [selected, setSelected] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  const current = (): Graph => ({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as NodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !k.startsWith("__"))) })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle as "yes" | "no" } : {}) })),
  })
  const problems = useMemo(() => validate(current()), [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = new Set(problems.map((p) => p.node).filter(Boolean))
  const shown = nodes.map((n) => (flagged.has(n.id) !== Boolean(n.data.__problem) ? { ...n, data: { ...n.data, __problem: flagged.has(n.id) } } : n))

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((es) => addEdge({ ...c, id: `${c.source}-${c.sourceHandle ?? ""}-${c.target}`, label: c.sourceHandle ? t(c.sourceHandle === "yes" ? "automations.yes" : "automations.no") : undefined }, es))
      setDirty(true)
    },
    [setEdges, t],
  )
  const add = (type: NodeType) => {
    const after = nodes.find((n) => n.id === selected) ?? nodes.at(-1)
    const nid = `${type}-${crypto.randomUUID().slice(0, 8)}`
    const position = after ? { x: after.position.x, y: after.position.y + 140 } : { x: 0, y: 0 }
    setNodes((ns) => [...ns, { id: nid, type, position, data: structuredClone(DEFAULTS[type]) }])
    // Connect from the selected step when it has a free output (conditions: the free branch).
    if (after) {
      const outs = edges.filter((e) => e.source === after.id)
      const handle = after.type === "condition" ? (["yes", "no"] as const).find((h) => !outs.some((e) => e.sourceHandle === h)) : outs.length ? undefined : null
      if (handle !== undefined) setEdges((es) => addEdge({ id: `${after.id}-${handle ?? ""}-${nid}`, source: after.id, target: nid, sourceHandle: handle, label: handle ? t(handle === "yes" ? "automations.yes" : "automations.no") : undefined }, es))
    }
    setSelected(nid)
    setDirty(true)
  }
  const update = (nid: string, patch: Data) => {
    setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, data: { ...n.data, ...patch } } : n)))
    setDirty(true)
  }
  const remove = (nid: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nid))
    setEdges((es) => es.filter((e) => e.source !== nid && e.target !== nid))
    setSelected(null)
    setDirty(true)
  }
  // Tidy up: steps in rows by distance from the trigger, branches side by side.
  const layout = () => {
    const depth = new Map<string, number>()
    const trigger = nodes.find((n) => n.type === "trigger")
    const queue = trigger ? [trigger.id] : []
    if (trigger) depth.set(trigger.id, 0)
    while (queue.length) {
      const nid = queue.shift()!
      for (const e of edges.filter((x) => x.source === nid))
        if (!depth.has(e.target)) {
          depth.set(e.target, depth.get(nid)! + 1)
          queue.push(e.target)
        }
    }
    const rows = new Map<number, string[]>()
    nodes.forEach((n) => rows.set(depth.get(n.id) ?? 99, [...(rows.get(depth.get(n.id) ?? 99) ?? []), n.id]))
    setNodes((ns) =>
      ns.map((n) => {
        const d = depth.get(n.id) ?? 99
        const row = rows.get(d)!
        return { ...n, position: { x: (row.indexOf(n.id) - (row.length - 1) / 2) * 300, y: (d === 99 ? rows.size : d) * 140 } }
      }),
    )
    setDirty(true)
  }
  const save = () =>
    start(async () => {
      const r = await saveWorkflow({ id, name, description, graph: current() })
      if (r.error) toast.error(r.error)
      else {
        setDirty(false)
        toast.success(r.problems?.length ? t("automations.savedDraft") : t("automations.saved"))
      }
    })
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ roots: "workflow", version: 1, name, description, graph: current() }, null, 2)], { type: "application/json" })
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "workflow"}.json` })
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const sel = nodes.find((n) => n.id === selected)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor="wf-name">{t("automations.name")}</Label>
          <Input id="wf-name" value={name} disabled={!canEdit} maxLength={200} onChange={(e) => (setName(e.target.value), setDirty(true))} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={layout} disabled={!canEdit}>
            <LayoutListIcon /> {t("automations.tidy")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportJson}>
            <DownloadIcon /> {t("automations.export")}
          </Button>
          {canEdit && (
            <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
              <SaveIcon /> {pending ? t("automations.saving") : t("common.save")}
            </Button>
          )}
        </div>
      </div>
      <Textarea value={description} disabled={!canEdit} maxLength={2000} rows={1} placeholder={t("automations.descriptionPlaceholder")} onChange={(e) => (setDescription(e.target.value), setDirty(true))} />
      {problems.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {[...new Set(problems.map((p) => p.key))].map((k) => (
            <li key={k}>
              <Badge variant="outline" className="border-destructive text-destructive">
                {t.dynamic(`automations.problems.${k}`)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 lg:grid-cols-[10rem_minmax(0,1fr)_20rem]">
        {canEdit && (
          <aside className="grid content-start gap-1" aria-label={t("automations.addStep")}>
            <p className="text-xs font-medium text-muted-foreground">{t("automations.addStep")}</p>
            {(["condition", "wait", ...ACTIONS] as NodeType[]).map((type) => {
              const Icon = ICONS[type]
              return (
                <Button key={type} type="button" variant="ghost" size="sm" className="justify-start" onClick={() => add(type)}>
                  <Icon /> {t.dynamic(`automations.nodes.${type}`)}
                </Button>
              )
            })}
          </aside>
        )}
        <div className="h-[70dvh] min-h-[460px] overflow-hidden rounded-lg border">
          <ReactFlow
            nodes={shown}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => (onNodesChange(c.filter((x) => x.type !== "remove" || nodes.find((n) => n.id === x.id)?.type !== "trigger")), c.some((x) => x.type !== "select" && x.type !== "dimensions") && setDirty(true))}
            onEdgesChange={(c) => (onEdgesChange(c), c.some((x) => x.type === "remove") && setDirty(true))}
            onConnect={onConnect}
            onSelectionChange={({ nodes: s }) => setSelected(s[0]?.id ?? null)}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" />
          </ReactFlow>
        </div>
        <aside className="grid content-start gap-4 rounded-lg border p-3" aria-label={t("automations.settings")}>
          {sel ? (
            <Inspector key={sel.id} node={sel} options={options} canEdit={canEdit} onChange={(p) => update(sel.id, p)} onRemove={() => remove(sel.id)} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("automations.selectHint")}</p>
          )}
        </aside>
      </div>
    </div>
  )
}

// Settings of the selected step.
function Inspector({ node, options, canEdit, onChange, onRemove }: { node: FlowNode; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void; onRemove: () => void }) {
  const t = useT()
  const d = node.data as Record<string, unknown>
  const type = node.type as NodeType
  const field = (k: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1">
      <Label htmlFor={`in-${k}`}>{label}</Label>
      <Input id={`in-${k}`} value={String(d[k] ?? "")} disabled={!canEdit} onChange={(e) => onChange({ [k]: e.target.value })} {...props} />
    </div>
  )
  const placeholders = ["first_name", "last_name", "name", "email", "org"]
  return (
    <div className="grid gap-4">
      <p className="flex items-center justify-between gap-2 font-medium">
        {t.dynamic(`automations.nodes.${type}`)}
        {canEdit && type !== "trigger" && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={t("automations.removeStep")}>
            <Trash2Icon />
          </Button>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{t.dynamic(`automations.help.${type}`)}</p>
      {type === "trigger" && (
        <div className="grid gap-1">
          <Label htmlFor="in-event">{t("automations.event")}</Label>
          <NativeSelect id="in-event" value={String(d.event ?? "")} disabled={!canEdit} onChange={(e) => onChange({ event: e.target.value })} className="w-full">
            <NativeSelectOption value="">{t("automations.pickEvent")}</NativeSelectOption>
            {options.events.map((e) => (
              <NativeSelectOption key={e.key} value={e.key}>
                {e.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      {type === "wait" && (
        <div className="grid grid-cols-2 gap-2">
          {field("amount", t("automations.amount"), { type: "number", min: 1, onChange: (e) => onChange({ amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) }) })}
          <div className="grid gap-1">
            <Label htmlFor="in-unit">{t("automations.unit")}</Label>
            <NativeSelect id="in-unit" value={String(d.unit)} disabled={!canEdit} onChange={(e) => onChange({ unit: e.target.value })} className="w-full">
              {WAIT_UNITS.map((u) => (
                <NativeSelectOption key={u} value={u}>
                  {t.dynamic(`automations.units.${u}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}
      {type === "condition" && <ConditionForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {type === "send_email" && (
        <>
          {field("subject", t("automations.subject"), { maxLength: 200 })}
          <div className="grid gap-1">
            <Label>{t("automations.body")}</Label>
            <RichTextEditor name="body" defaultValue={String(d.body ?? "")} placeholders={placeholders} disabled={!canEdit} onChange={(html) => onChange({ body: html })} />
          </div>
        </>
      )}
      {(type === "add_tag" || type === "remove_tag") && (
        <>
          {field("tag", t("automations.tag"), { maxLength: 40, list: "wf-tags" })}
          <datalist id="wf-tags">
            {options.tags.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </>
      )}
      {type === "set_field" && (
        <>
          <div className="grid gap-1">
            <Label htmlFor="in-field">{t("automations.field")}</Label>
            <NativeSelect id="in-field" value={String(d.field ?? "")} disabled={!canEdit} onChange={(e) => onChange({ field: e.target.value })} className="w-full">
              <NativeSelectOption value="">–</NativeSelectOption>
              {options.customFields.map((f) => (
                <NativeSelectOption key={f.key} value={f.key}>
                  {f.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {field("value", t("automations.value"), { maxLength: 2000 })}
        </>
      )}
      {type === "webhook" && field("url", "URL", { type: "url", placeholder: "https://…" })}
      {type === "notify_team" && field("text", t("automations.text"), { maxLength: 500 })}
      {type !== "trigger" && type !== "wait" && type !== "condition" && <p className="text-xs text-muted-foreground">{t("automations.placeholdersHint")}</p>}
    </div>
  )
}

function ConditionForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const rules = (d.rules as { field: string; op: string; value: string }[]) ?? []
  const set = (i: number, patch: Partial<(typeof rules)[number]>) => onChange({ rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div className="grid gap-3">
      <NativeSelect value={String(d.match ?? "all")} disabled={!canEdit} onChange={(e) => onChange({ match: e.target.value })} aria-label={t("automations.match")} className="w-full">
        <NativeSelectOption value="all">{t("automations.matchAll")}</NativeSelectOption>
        <NativeSelectOption value="any">{t("automations.matchAny")}</NativeSelectOption>
      </NativeSelect>
      {rules.map((r, i) => (
        <div key={i} className="grid gap-1 rounded-md border p-2">
          <Input value={r.field} list="wf-fields" disabled={!canEdit} placeholder={t("automations.fieldPlaceholder")} aria-label={t("automations.field")} onChange={(e) => set(i, { field: e.target.value })} />
          <NativeSelect value={r.op} disabled={!canEdit} onChange={(e) => set(i, { op: e.target.value })} aria-label={t("automations.op")} className="w-full">
            {OPS.map((o) => (
              <NativeSelectOption key={o} value={o}>
                {t.dynamic(`automations.ops.${o}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {r.op !== "empty" && r.op !== "not_empty" && <Input value={r.value} disabled={!canEdit} aria-label={t("automations.value")} placeholder={t("automations.value")} onChange={(e) => set(i, { value: e.target.value })} />}
          {canEdit && rules.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange({ rules: rules.filter((_, j) => j !== i) })}>
              {t("automations.removeRule")}
            </Button>
          )}
        </div>
      ))}
      {canEdit && rules.length < 20 && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange({ rules: [...rules, { field: "", op: "eq", value: "" }] })}>
          {t("automations.addRule")}
        </Button>
      )}
      <datalist id="wf-fields">
        {options.fields.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </datalist>
    </div>
  )
}
