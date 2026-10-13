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
import { BellIcon, CheckIcon, ClockIcon, DownloadIcon, FlaskConicalIcon, XIcon, GitForkIcon, LayoutListIcon, MailIcon, PencilIcon, SaveIcon, TagIcon, TagsIcon, Trash2Icon, WebhookIcon, ZapIcon, type LucideIcon } from "lucide-react"
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
import { ACTIONS, validate, WAIT_UNITS, type Graph, type NodeType, type TraceStep } from "@/automations/graph"
import { OBJECTS, objectsFor, OPS_FOR, splitPath, WRITABLE, type Field, type Kind, type ObjectKey, type RefList } from "@/automations/objects"
import { saveWorkflow, testRun, testSamples } from "../actions"

type Data = Record<string, unknown>
type FlowNode = Node<Data, NodeType>
type Option = { value: string; label: string }
export type EditorOptions = {
  events: { key: string; label: string }[]
  customFields: { key: string; label: string; type: string; options: string[] }[]
  tags: string[]
  refs: Partial<Record<RefList, Option[]>> // pickable records (events, membership types, forms, courses, guest lists)
  modules: string[] // the org's active modules: objects/actions of others aren't offered
}

// Fields of an object as the pickers show them (catalog + the contacts' custom fields); `write` = only settable ones.
function fieldsOf(o: string, options: EditorOptions, label: (k: string) => string, write = false): (Field & { label: string })[] {
  if (!(o in OBJECTS)) return []
  const base = OBJECTS[o as ObjectKey].fields.filter((f) => !write || f.write).map((f) => ({ ...f, label: label(`automations.fields.${o}.${f.key}`) }))
  const custom =
    o === "contact"
      ? options.customFields.map((f) => ({
          key: `custom.${f.key}`,
          label: f.label,
          kind: (f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "boolean" ? "bool" : f.type === "select" ? "enum" : "text") as Kind,
          options: f.options,
          write: true as const,
        }))
      : []
  return [...base, ...custom]
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
  const trace = data.__trace as TraceStep | null | undefined // undefined = no test run, null = not reached
  return (
    <div
      className={cn(
        "w-64 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm",
        selected && "ring-2 ring-ring",
        problem && "border-destructive",
        type === "trigger" && "border-primary",
        trace && "border-primary bg-primary/5",
        trace === null && "opacity-50",
      )}
    >
      {type !== "trigger" && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{t.dynamic(`automations.nodes.${type}`)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>
      {trace && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
          <CheckIcon className="size-3" />
          {trace.branch ? t(trace.branch === "yes" ? "automations.yes" : "automations.no") : trace.wait ? t("automations.wouldWait", { time: duration(trace.wait, t) }) : type === "trigger" ? t("automations.testResult") : t("automations.wouldDo")}
        </p>
      )}
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
const duration = (ms: number, t: ReturnType<typeof useT>) =>
  ms % 86_400_000 === 0 ? `${ms / 86_400_000} ${t("automations.units.days")}` : ms % 3_600_000 === 0 ? `${ms / 3_600_000} ${t("automations.units.hours")}` : `${ms / 60_000} ${t("automations.units.minutes")}`

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
  // Test run: pick a real event of the trigger type, play the (unsaved) flow through, show the path.
  const [test, setTest] = useState<{ samples: { id: number; at: string; label: string }[] | null; eventId: string; trace: TraceStep[] | null; data: Record<string, unknown> | null } | null>(null)
  const [testing, startTest] = useTransition()
  const triggerEvent = String(nodes.find((n) => n.type === "trigger")?.data.event ?? "")
  const openTest = () =>
    startTest(async () => {
      const samples = await testSamples(triggerEvent)
      setTest({ samples, eventId: samples[0] ? String(samples[0].id) : "", trace: null, data: null })
    })
  const runTest = () =>
    startTest(async () => {
      if (!test?.eventId) return
      const r = await testRun({ eventId: Number(test.eventId), graph: current() })
      if (r.error) toast.error(r.error)
      else setTest({ ...test, trace: r.trace ?? [], data: r.data ?? null })
    })

  const current = (): Graph => ({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as NodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !k.startsWith("__"))) })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle as "yes" | "no" } : {}) })),
  })
  const problems = useMemo(() => validate(current()), [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps
  const flagged = new Set(problems.map((p) => p.node).filter(Boolean))
  const traced = new Map((test?.trace ?? []).map((st) => [st.node, st]))
  const shown = nodes.map((n) => ({ ...n, data: { ...n.data, __problem: flagged.has(n.id), __trace: test?.trace ? (traced.get(n.id) ?? null) : undefined } }))
  const shownEdges = test?.trace
    ? edges.map((e) => {
        const from = traced.get(e.source)
        const taken = !!from && traced.has(e.target) && (!from.branch || from.branch === e.sourceHandle)
        return taken ? { ...e, animated: true, style: { stroke: "var(--primary)", strokeWidth: 2 } } : e
      })
    : edges

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
          <Button type="button" variant="outline" size="sm" onClick={openTest} disabled={testing || !triggerEvent}>
            <FlaskConicalIcon /> {t("automations.testRun")}
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
      {test && (
        <section className="grid gap-2 rounded-lg border border-primary/40 p-3" aria-label={t("automations.testRun")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("automations.testHint")}</p>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("automations.closeTest")} onClick={() => setTest(null)}>
              <XIcon />
            </Button>
          </div>
          {test.samples?.length ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <Label htmlFor="test-sample">{t("automations.testSample")}</Label>
                <NativeSelect id="test-sample" value={test.eventId} onChange={(e) => setTest({ ...test, eventId: e.target.value, trace: null, data: null })} className="w-full">
                  {test.samples.map((x) => (
                    <NativeSelectOption key={x.id} value={String(x.id)}>
                      {new Date(x.at).toLocaleString()}
                      {x.label && ` · ${x.label}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Button type="button" size="sm" onClick={runTest} disabled={testing}>
                {testing ? t("automations.testing") : t("automations.runTest")}
              </Button>
            </div>
          ) : (
            <p className="text-sm">{t("automations.noSamples")}</p>
          )}
          {test.data && (
            <details className="text-xs">
              <summary className="cursor-pointer">{t("automations.testData")}</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2">{JSON.stringify(test.data, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
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
            edges={shownEdges}
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
            <Inspector
              key={sel.id}
              node={sel}
              options={options}
              trigger={triggerEvent}
              trace={test?.trace ? (traced.get(sel.id) ?? null) : undefined}
              canEdit={canEdit}
              onChange={(p) => update(sel.id, p)}
              onRemove={() => remove(sel.id)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("automations.selectHint")}</p>
          )}
        </aside>
      </div>
    </div>
  )
}

// Settings of the selected step.
function Inspector({
  node,
  options,
  trigger,
  trace,
  canEdit,
  onChange,
  onRemove,
}: {
  node: FlowNode
  options: EditorOptions
  trigger: string
  trace?: TraceStep | null
  canEdit: boolean
  onChange: (p: Data) => void
  onRemove: () => void
}) {
  const t = useT()
  const d = node.data as Record<string, unknown>
  const type = node.type as NodeType
  const field = (k: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1">
      <Label htmlFor={`in-${k}`}>{label}</Label>
      <Input id={`in-${k}`} value={String(d[k] ?? "")} disabled={!canEdit} onChange={(e) => onChange({ [k]: e.target.value })} {...props} />
    </div>
  )
  const mods = new Set(options.modules)
  // Placeholders from the same catalog as the conditions: what the trigger brings.
  const placeholders = [
    "first_name",
    "name",
    "org",
    ...objectsFor(trigger, mods).flatMap((o) => OBJECTS[o].fields.filter((f) => f.kind !== "ref" && f.kind !== "tags" && f.kind !== "bool").map((f) => `${o}.${f.key}`)),
    ...(objectsFor(trigger, mods).includes("contact") ? options.customFields.map((f) => `contact.custom.${f.key}`) : []),
  ]
  const insert = (k: string, token: string) => onChange({ [k]: `${String(d[k] ?? "")}{${token}}` })
  const chips = (k: string) =>
    canEdit && (
      <div className="flex flex-wrap gap-1" aria-label={t("automations.insertPlaceholder")}>
        {placeholders.map((p) => (
          <button key={p} type="button" onClick={() => insert(k, p)} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted">
            {`{${p}}`}
          </button>
        ))}
      </div>
    )
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
      {trace !== undefined && <TraceView trace={trace} />}
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
      {type === "condition" && <ConditionForm d={d} options={options} trigger={trigger} canEdit={canEdit} onChange={onChange} />}
      {type === "send_email" && (
        <>
          {field("subject", t("automations.subject"), { maxLength: 200 })}
          {chips("subject")}
          <div className="grid gap-1">
            <Label>{t("automations.body")}</Label>
            <RichTextEditor name="body" defaultValue={String(d.body ?? "")} placeholders={placeholders} disabled={!canEdit} onChange={(html) => onChange({ body: html })} />
          </div>
        </>
      )}
      {(type === "add_tag" || type === "remove_tag") && <TagPick value={String(d.tag ?? "")} tags={options.tags} creatable={type === "add_tag"} disabled={!canEdit} onChange={(tag) => onChange({ tag })} />}
      {type === "set_field" && <SetField d={d} options={options} trigger={trigger} canEdit={canEdit} onChange={onChange} />}
      {type === "webhook" && field("url", "URL", { type: "url", placeholder: "https://…" })}
      {type === "notify_team" && (
        <>
          {field("text", t("automations.text"), { maxLength: 500 })}
          {chips("text")}
        </>
      )}
      {(type === "send_email" || type === "notify_team") && <p className="text-xs text-muted-foreground">{t("automations.placeholdersHint")}</p>}
    </div>
  )
}

// What this step did in the test run: condition rules (value seen vs expected), filled texts, wait.
function TraceView({ trace }: { trace: TraceStep | null }) {
  const t = useT()
  if (!trace) return <p className="rounded-md bg-muted px-2 py-1 text-xs">{t("automations.notReached")}</p>
  const show = (v: unknown) => (v == null || v === "" ? "–" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v))
  return (
    <div className="grid gap-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
      <p className="font-medium">{t("automations.testResult")}</p>
      {trace.rules?.map((r, i) => (
        <p key={i} className={r.ok ? "" : "text-destructive"}>
          {r.ok ? "✓" : "✗"} {r.field}: {t("automations.actual")} „{show(r.actual)}“ · {t("automations.expected")} {t.dynamic(`automations.ops.${r.op}`)} „{r.expected}“
        </p>
      ))}
      {trace.branch && <p>→ {t(trace.branch === "yes" ? "automations.yes" : "automations.no")}</p>}
      {trace.wait != null && <p>{t("automations.wouldWait", { time: duration(trace.wait, t) })}</p>}
      {trace.preview &&
        Object.entries(trace.preview).map(([k, v]) => (
          <p key={k} className="break-words">
            <span className="text-muted-foreground">{k}: </span>
            {k === "body" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : v}
          </p>
        ))}
    </div>
  )
}

// Set field: object (writable ones the trigger brings) → writable field → value control that fits the field.
function SetField({ d, options, trigger, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const path = String(d.field ?? "")
  const { object, field } = path.includes(".") ? splitPath(path) : { object: path ? "contact" : "", field: path ? `custom.${path}` : "" }
  const objects = objectsFor(trigger, new Set(options.modules)).filter((o) => WRITABLE.includes(o))
  const fields = fieldsOf(object, options, (k) => t.dynamic(k), true)
  const f = fields.find((x) => x.key === field)
  return (
    <div className="grid gap-2">
      <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ field: e.target.value ? `${e.target.value}.` : "", value: "" })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {t.dynamic(`automations.objects.${o}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {!objects.length && <p className="text-xs text-muted-foreground">{t("automations.nothingToSet")}</p>}
      {object && (
        <NativeSelect value={field} disabled={!canEdit} aria-label={t("automations.field")} className="w-full" onChange={(e) => onChange({ field: `${object}.${e.target.value}`, value: "" })}>
          <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
          {fields.map((x) => (
            <NativeSelectOption key={x.key} value={x.key}>
              {x.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {f && <ValueInput f={f} value={String(d.value ?? "")} options={options} disabled={!canEdit} onChange={(value) => onChange({ value })} />}
    </div>
  )
}

// One rule = object (what the trigger brings) → field → comparison that fits the field → value from real data.
function ConditionForm({ d, options, trigger, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const rules = (d.rules as { field: string; op: string; value: string }[]) ?? []
  const set = (i: number, patch: Partial<(typeof rules)[number]>) => onChange({ rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const objects = objectsFor(trigger, new Set(options.modules))
  const fieldsFor = (o: string) => fieldsOf(o, options, (k) => t.dynamic(k))
  return (
    <div className="grid gap-3">
      <NativeSelect value={String(d.match ?? "all")} disabled={!canEdit} onChange={(e) => onChange({ match: e.target.value })} aria-label={t("automations.match")} className="w-full">
        <NativeSelectOption value="all">{t("automations.matchAll")}</NativeSelectOption>
        <NativeSelectOption value="any">{t("automations.matchAny")}</NativeSelectOption>
      </NativeSelect>
      {!trigger && <p className="text-xs text-muted-foreground">{t("automations.pickTriggerFirst")}</p>}
      {rules.map((r, i) => {
        const { object, field } = splitPath(r.field)
        const fields = fieldsFor(object)
        const f = fields.find((x) => x.key === field)
        const ops = f ? OPS_FOR[f.kind] : []
        return (
          <div key={i} className="grid gap-1 rounded-md border p-2">
            <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => set(i, { field: `${e.target.value}.`, op: "eq", value: "" })}>
              <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
              {objects.map((o) => (
                <NativeSelectOption key={o} value={o}>
                  {t.dynamic(`automations.objects.${o}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {object && (
              <NativeSelect
                value={field}
                disabled={!canEdit}
                aria-label={t("automations.field")}
                className="w-full"
                onChange={(e) => {
                  const nf = fields.find((x) => x.key === e.target.value)
                  set(i, { field: `${object}.${e.target.value}`, op: nf ? OPS_FOR[nf.kind][0] : "eq", value: nf?.kind === "bool" ? "true" : "" })
                }}
              >
                <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
                {fields.map((x) => (
                  <NativeSelectOption key={x.key} value={x.key}>
                    {x.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {f && ops.length > 1 && (
              <NativeSelect value={r.op} disabled={!canEdit} onChange={(e) => set(i, { op: e.target.value })} aria-label={t("automations.op")} className="w-full">
                {ops.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {t.dynamic(`automations.ops.${f.kind === "date" && (o === "gt" || o === "lt" || o === "gte" || o === "lte") ? `date_${o}` : o}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {f && r.op !== "empty" && r.op !== "not_empty" && <ValueInput f={f} value={r.value} options={options} disabled={!canEdit} onChange={(value) => set(i, { value })} />}
            {canEdit && rules.length > 1 && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange({ rules: rules.filter((_, j) => j !== i) })}>
                {t("automations.removeRule")}
              </Button>
            )}
          </div>
        )
      })}
      {canEdit && rules.length < 20 && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange({ rules: [...rules, { field: "", op: "eq", value: "" }] })}>
          {t("automations.addRule")}
        </Button>
      )}
    </div>
  )
}

// The value control that fits the field: records/tags/options to pick, yes/no, date, number or text.
function ValueInput({ f, value, options, disabled, onChange }: { f: Field; value: string; options: EditorOptions; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const pick = (items: Option[]) => (
    <NativeSelect value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={t("automations.value")} className="w-full">
      <NativeSelectOption value="">{t("automations.pickValue")}</NativeSelectOption>
      {items.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
  if (f.kind === "bool") return pick([{ value: "true", label: t("automations.yes") }, { value: "false", label: t("automations.no") }])
  if (f.kind === "tags") return <TagPick value={value} tags={options.tags} disabled={disabled} onChange={onChange} />
  if (f.kind === "ref" && f.ref) return pick(options.refs[f.ref] ?? [])
  if (f.kind === "enum")
    return pick((f.options ?? []).map((o) => ({ value: o, label: t.has(`automations.values.${o}` as never) ? t.dynamic(`automations.values.${o}`) : o })))
  return (
    <Input
      type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
      value={value}
      disabled={disabled}
      aria-label={t("automations.value")}
      placeholder={t("automations.value")}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// One tag: type to filter the org's tags, click one, or (when creatable) keep the typed text as a new tag.
function TagPick({ value, tags, creatable, disabled, onChange }: { value: string; tags: string[]; creatable?: boolean; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const q = value.trim().toLowerCase()
  const matches = tags.filter((x) => !q || x.toLowerCase().includes(q)).slice(0, 30)
  const known = tags.some((x) => x.toLowerCase() === q)
  return (
    <div className="grid gap-1">
      <Label htmlFor="in-tag">{t("automations.tag")}</Label>
      <Input id="in-tag" value={value} maxLength={40} disabled={disabled} placeholder={t("automations.tagPlaceholder")} onChange={(e) => onChange(e.target.value)} />
      {!disabled && (
        <div className="flex flex-wrap gap-1">
          {matches.map((x) => (
            <button key={x} type="button" onClick={() => onChange(x)} className={cn("rounded-full border px-2 py-0.5 text-xs hover:bg-muted", x.toLowerCase() === q && "border-primary bg-muted")}>
              {x}
            </button>
          ))}
          {q && !known && <span className="text-xs text-muted-foreground">{creatable ? t("automations.newTag", { tag: value.trim() }) : t("automations.unknownTag")}</span>}
        </div>
      )}
    </div>
  )
}
