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
import { BellIcon, FilePlus2Icon, SearchIcon, SigmaIcon, CheckIcon, ChevronsUpDownIcon, ClockIcon, SendIcon, DownloadIcon, FlaskConicalIcon, XIcon, GitForkIcon, LayoutListIcon, MailIcon, PencilIcon, SaveIcon, TagIcon, TagsIcon, Trash2Icon, WebhookIcon, ZapIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { ACTIONS, DATA_STEPS, stepKey, triggerKey, validate, WAIT_UNITS, type Graph, type NodeType, type TraceStep } from "@/automations/graph"
import { creatableFor, def, OBJECTS, searchFields, objectsFor, OPS_FOR, parseRecordTrigger, SCHEDULE_OBJECTS, splitPath, writableFor, type Field, type Kind, type ObjectKey, type RefList } from "@/automations/objects"
import { saveWorkflow, testRun, testSamples } from "../actions"

type Data = Record<string, unknown>
type FlowNode = Node<Data, NodeType>
type Option = { value: string; label: string }
export type EditorOptions = {
  triggers: { group: string; items: { key: string; label: string }[] }[] // by module: its events + "record created/changed/deleted"
  customFields: { key: string; label: string; type: string; options: string[] }[]
  tags: string[]
  refs: Partial<Record<RefList, Option[]>> // pickable records (events, membership types, forms, courses, guest lists)
  modules: string[] // the org's active modules: objects/actions of others aren't offered
  telegram: { connected: boolean; chats: { id: string; title: string }[] }
  answers: (Field & { label: string })[] // fields the org's forms ask for (submission.answers.<key>)
  steps?: { key: string; object: string; label: string }[] // results of data steps in this flow (set by the editor)
}

const isObject = (o: string): o is ObjectKey => o in OBJECTS
const objectLabel = (o: string, options: EditorOptions, label: (k: string) => string) => options.steps?.find((x) => x.key === o)?.label ?? label(`automations.objects.${o}`)
// Fields of an object as the pickers show them (catalog + the contacts' custom fields); `write` = only settable ones.
function fieldsOf(o: string, options: EditorOptions, label: (k: string) => string, write = false, search = false): (Field & { label: string })[] {
  const step = options.steps?.find((x) => x.key === o)
  if (step)
    return step.object === "aggregate"
      ? write
        ? []
        : [
            { key: "value", kind: "number", label: label("automations.aggResult") },
            { key: "count", kind: "number", label: label("automations.aggCount") },
          ]
      : fieldsOf(step.object, options, label, write, search)
  if (!o || !isObject(o)) return []
  if (search && !write)
    return searchFields(o).map((f) => ({ ...f, label: f.kind === "link" ? label(`automations.objects.${f.target}`) : label(`automations.fields.${o}.${f.key}`) }))
  const base = def(o).fields.filter((f) => !write || f.write).map((f) => ({ ...f, label: label(`automations.fields.${o}.${f.key}`) }))
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
  // Form answers of a submission (what was entered), incl. the org's custom fields.
  const answerFields = o === "submission" ? options.answers.map((f) => ({ ...f, key: `answers.${f.key}`, label: `${label("automations.answer")}: ${f.label}` })) : []
  return [...base, ...(o === "contact" ? custom : []), ...answerFields]
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
  create_record: FilePlus2Icon,
  find_record: SearchIcon,
  aggregate: SigmaIcon,
  telegram: SendIcon,
}
const DEFAULTS: Record<NodeType, Data> = {
  trigger: { event: "" },
  condition: { match: "all", rules: [{ field: "", op: "eq", value: "" }] },
  wait: { mode: "for", amount: 1, unit: "days", until: "" },
  send_email: { to: "{contact.email}", subject: "", body: "" },
  add_tag: { tag: "" },
  remove_tag: { tag: "" },
  set_field: { field: "", value: "" },
  webhook: { url: "" },
  notify_team: { text: "" },
  create_record: { object: "", values: {} },
  find_record: { object: "", rules: [], sort: "", dir: "desc", label: "" },
  aggregate: { object: "", rules: [], op: "count", field: "", label: "" },
  telegram: { chat_id: "", text: "" },
}
// The sidebar's sections.
const PALETTE: { section: string; types: NodeType[] }[] = [
  { section: "logic", types: ["condition", "wait"] },
  { section: "query", types: ["find_record", "aggregate"] },
  { section: "send", types: ["send_email", "notify_team", "telegram"] },
  { section: "data", types: ["add_tag", "remove_tag", "set_field", "create_record"] },
  { section: "connect", types: ["webhook"] },
]

// One step on the canvas: icon, kind, a one-line summary; conditions have a yes and a no output.
function StepNode({ type, data, selected }: NodeProps<FlowNode>) {
  const t = useT()
  const Icon = ICONS[type]
  const summary = (() => {
    const d = data as Record<string, string | number | { field: string }[]>
    if (type === "trigger") return (d.event as string) ? triggerLabel(String(d.event), t) : t("automations.pickEvent")
    if (type === "wait") return `${d.amount} ${t.dynamic(`automations.units.${d.unit}`)}`
    if (type === "condition") return ((d.rules as { field: string }[]) ?? []).map((r) => r.field).filter(Boolean).join(", ") || "–"
    return String(d.subject ?? d.tag ?? d.field ?? d.url ?? d.text ?? d.to ?? "") || "–"
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
        <span className="truncate font-medium">{String(data.label ?? "") || t.dynamic(`automations.nodes.${type}`)}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>
      {trace && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
          <CheckIcon className="size-3" />
          <span className="truncate">
            {trace.branch
              ? t(trace.branch === "yes" ? "automations.yes" : "automations.no")
              : trace.wait
                ? t("automations.wouldWait", { time: duration(trace.wait, t) })
                : type === "trigger"
                  ? t("automations.testResult")
                  : previewLine(trace.preview) || t("automations.wouldDo")}
          </span>
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

// The one line a card shows in a test run: the filled text / subject / tag / "field = value".
const previewLine = (p?: Record<string, string>) =>
  !p ? "" : p.field ? `${p.field} = ${p.value || "–"}` : (p.subject ?? p.text ?? p.tag ?? p.to ?? p.url ?? Object.values(p).find(Boolean) ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

const nodeTypes = Object.fromEntries(["trigger", "condition", "wait", ...DATA_STEPS, ...ACTIONS].map((k) => [k, StepNode]))

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
  const [test, setTest] = useState<{ samples: { id: string; at: string; label: string }[] | null; eventId: string; trace: TraceStep[] | null; data: Record<string, unknown> | null } | null>(null)
  const [testing, startTest] = useTransition()
  const triggerEvent = triggerKey(nodes.find((n) => n.type === "trigger")?.data)
  const openTest = () =>
    startTest(async () => {
      const samples = await testSamples(triggerEvent)
      setTest({ samples, eventId: samples[0]?.id ?? "", trace: null, data: null })
    })
  const runTest = () =>
    startTest(async () => {
      if (!test?.eventId) return
      const r = await testRun({ eventId: test.eventId, graph: current() })
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
  // Results of data steps, usable by every step as objects ("Ergebnis: Mitgliedschaft").
  const flowOptions: EditorOptions = {
    ...options,
    steps: (() => {
      // Named after what they look up; numbered when the same thing is looked up twice.
      const data = nodes.filter((n) => n.type === "find_record" || n.type === "aggregate")
      const base = (n: (typeof data)[number]) =>
        `${t(n.type === "aggregate" ? "automations.aggResultOf" : "automations.result")}: ${n.data.object ? t.dynamic(`automations.objects.${n.data.object}`) : t.dynamic(`automations.nodes.${n.type}`)}`
      return data.map((n) => {
        const same = data.filter((x) => base(x) === base(n))
        const own = String(n.data.label ?? "")
        return { key: stepKey(n.id), object: n.type === "aggregate" ? "aggregate" : String(n.data.object ?? ""), label: own || (same.length > 1 ? `${base(n)} ${same.indexOf(n) + 1}` : base(n)) }
      })
    })(),
  }

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
                    <NativeSelectOption key={x.id} value={x.id}>
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
          <aside className="grid content-start gap-3" aria-label={t("automations.addStep")}>
            {PALETTE.map((sec) => (
              <div key={sec.section} className="grid gap-0.5">
                <p className="px-2 text-xs font-medium text-muted-foreground">{t.dynamic(`automations.sections.${sec.section}`)}</p>
                {sec.types.map((type) => {
                  const Icon = ICONS[type]
                  const off = type === "telegram" && !options.telegram.connected
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      disabled={off}
                      title={off ? t("automations.telegramOff") : undefined}
                      onClick={() => add(type)}
                    >
                      <Icon /> {t.dynamic(`automations.nodes.${type}`)}
                    </Button>
                  )
                })}
              </div>
            ))}
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
              options={flowOptions}
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
  const stepKeys = (options.steps ?? []).filter((x) => x.key !== stepKey(node.id)).map((x) => x.key)
  // Placeholders from the same catalog as the conditions: what the trigger brings.
  const placeholders = [
    "first_name",
    "name",
    "org",
    ...objectsFor(trigger, mods).flatMap((o) => def(o).fields.filter((f) => f.kind !== "ref" && f.kind !== "tags" && f.kind !== "bool").map((f) => `${o}.${f.key}`)),
    ...(objectsFor(trigger, mods).includes("contact") ? options.customFields.map((f) => `contact.custom.${f.key}`) : []),
    ...stepKeys.flatMap((k) => fieldsOf(k, options, (x) => t.dynamic(x)).filter((f) => f.kind !== "link" && f.kind !== "ref" && f.kind !== "tags").map((f) => `${k}.${f.key}`)),
    ...(objectsFor(trigger, mods).includes("submission") ? options.answers.filter((f) => f.kind !== "ref" && f.kind !== "tags" && f.kind !== "bool").map((f) => `submission.answers.${f.key}`) : []),
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
      <div className="flex items-center justify-between gap-2 font-medium">
        <StepTitle value={String(d.label ?? "")} fallback={t.dynamic(`automations.nodes.${type}`)} canEdit={canEdit} onChange={(label) => onChange({ label })} />
        {canEdit && type !== "trigger" && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={t("automations.removeStep")}>
            <Trash2Icon />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t.dynamic(`automations.help.${type}`)}</p>
      {trace !== undefined && <TraceView trace={trace} />}
      {type === "trigger" && <TriggerForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {type === "wait" && (
        <div className="grid gap-2">
          <NativeSelect value={String(d.mode ?? "for")} disabled={!canEdit} aria-label={t("automations.waitMode")} className="w-full" onChange={(e) => onChange({ mode: e.target.value })}>
            <NativeSelectOption value="for">{t("automations.waitFor")}</NativeSelectOption>
            <NativeSelectOption value="until">{t("automations.waitUntil")}</NativeSelectOption>
          </NativeSelect>
          {d.mode === "until" ? (
            <DateValue value={String(d.until ?? "")} time dates={dateBases(objectsFor(trigger, mods), (k) => t.dynamic(k))} disabled={!canEdit} onChange={(until) => onChange({ until })} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {field("amount", t("automations.amount"), { type: "number", min: 1, onChange: (e) => onChange({ amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) }) })}
              <div className="grid gap-1">
                <Label htmlFor="in-unit">{t("automations.unit")}</Label>
                <NativeSelect id="in-unit" value={String(d.unit ?? "days")} disabled={!canEdit} onChange={(e) => onChange({ unit: e.target.value })} className="w-full">
                  {WAIT_UNITS.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {t.dynamic(`automations.units.${u}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
        </div>
      )}
      {type === "condition" && <ConditionForm d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {(type === "find_record" || type === "aggregate") && <DataStepForm type={type} d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {type === "send_email" && (
        <>
          {field("to", t("automations.to"), { maxLength: 320, placeholder: "{contact.email}" })}
          {canEdit && (
            <div className="flex flex-wrap gap-1">
              {placeholders
                .filter((p) => p.endsWith("email"))
                .map((p) => (
                  <button key={p} type="button" onClick={() => onChange({ to: `{${p}}` })} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted">
                    {`{${p}}`}
                  </button>
                ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("automations.toHint")}</p>
          {field("subject", t("automations.subject"), { maxLength: 200 })}
          {chips("subject")}
          <div className="grid gap-1">
            <Label>{t("automations.body")}</Label>
            <RichTextEditor name="body" defaultValue={String(d.body ?? "")} placeholders={placeholders} disabled={!canEdit} onChange={(html) => onChange({ body: html })} />
          </div>
        </>
      )}
      {(type === "add_tag" || type === "remove_tag") && <TagPick value={String(d.tag ?? "")} tags={options.tags} creatable={type === "add_tag"} disabled={!canEdit} onChange={(tag) => onChange({ tag })} />}
      {type === "set_field" && <SetField d={d} options={options} trigger={trigger} extra={stepKeys} canEdit={canEdit} onChange={onChange} />}
      {type === "create_record" && <CreateRecord d={d} options={options} trigger={trigger} canEdit={canEdit} onChange={onChange} />}
      {type === "telegram" && (
        <>
          {!options.telegram.connected && <p className="text-xs text-destructive">{t("automations.telegramOff")}</p>}
          <div className="grid gap-1">
            <Label htmlFor="in-chat">{t("automations.chat")}</Label>
            <NativeSelect id="in-chat" value={String(d.chat_id ?? "")} disabled={!canEdit} onChange={(e) => onChange({ chat_id: e.target.value })} className="w-full">
              <NativeSelectOption value="">{t("automations.pickChat")}</NativeSelectOption>
              {options.telegram.chats.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {field("text", t("automations.text"), { maxLength: 4000 })}
          {chips("text")}
        </>
      )}
      {type === "webhook" && field("url", "URL", { type: "url", placeholder: "https://…" })}
      {type === "notify_team" && (
        <>
          {field("text", t("automations.text"), { maxLength: 500 })}
          {chips("text")}
        </>
      )}
      {(type === "send_email" || type === "notify_team" || type === "telegram") && <p className="text-xs text-muted-foreground">{t("automations.placeholdersHint")}</p>}
    </div>
  )
}

/** "Ticket sold" or, for record triggers, "Ticket · created". */
export function triggerLabel(key: string, t: ReturnType<typeof useT>) {
  if (key === "schedule") return t("automations.schedule")
  const rec = parseRecordTrigger(key)
  return rec ? `${t.dynamic(`automations.objects.${rec.object}`)} · ${t.dynamic(`automations.recordActions.${rec.action}`)}` : t.dynamic(`events.types.${key}`)
}

// Trigger: search over all triggers of the active modules, grouped by module; "record changed" can watch fields.
function TriggerForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const value = String(d.event ?? "")
  const rec = parseRecordTrigger(value)
  const watch = (d.fields as string[] | undefined) ?? []
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label>{t("automations.event")}</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" disabled={!canEdit} />}>
            <span className="truncate">{value ? triggerLabel(value, t) : t("automations.pickEvent")}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput placeholder={t("automations.searchTrigger")} />
              <CommandList className="max-h-80">
                <CommandEmpty>{t("automations.noTrigger")}</CommandEmpty>
                {options.triggers.map((g) => (
                  <CommandGroup key={g.group} heading={g.group}>
                    {g.items.map((it) => (
                      <CommandItem
                        key={it.key}
                        value={`${g.group} ${it.label}`}
                        data-checked={it.key === value}
                        onSelect={() => (onChange(it.key === "schedule" ? { event: "schedule", every: "day", time: "09:00", fields: [] } : { event: it.key, fields: [] }), setOpen(false))}
                      >
                        {it.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {value === "schedule" && <ScheduleForm d={d} options={options} canEdit={canEdit} onChange={onChange} />}
      {value && (
        <div className="grid gap-1">
          <Label htmlFor="tr-once">{t("automations.onceLabel")}</Label>
          <NativeSelect id="tr-once" value={String(d.once ?? "")} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ once: e.target.value })}>
            <NativeSelectOption value="">{t("automations.onceNo")}</NativeSelectOption>
            <NativeSelectOption value="contact">{t("automations.oncePerPerson")}</NativeSelectOption>
            <NativeSelectOption value="record">{t("automations.oncePerRecord")}</NativeSelectOption>
          </NativeSelect>
          {d.once ? (
            <label className="flex items-center gap-2 text-sm">
              {t("automations.againAfter")}
              <Input type="number" min={0} className="w-20" value={Number(d.again_after_days ?? 0)} disabled={!canEdit} aria-label={t("automations.days")} onChange={(e) => onChange({ again_after_days: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              {t("automations.days")}
            </label>
          ) : null}
        </div>
      )}
      {rec?.action === "update" && (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t("automations.watchFields")}</legend>
          <p className="text-xs text-muted-foreground">{t("automations.watchHint")}</p>
          {def(rec.object).fields
            .filter((f) => f.key !== "id")
            .map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={!canEdit}
                  checked={watch.includes(f.key)}
                  onChange={(e) => onChange({ fields: e.target.checked ? [...watch, f.key] : watch.filter((x) => x !== f.key) })}
                />
                {t.dynamic(`automations.fields.${rec.object}.${f.key}`)}
              </label>
            ))}
        </fieldset>
      )}
    </div>
  )
}

// Schedule: when (daily/weekly/monthly at a time) and for what: once, or each record of an object that passes
// the filters (conditions on its fields, and/or "N days before/after a date", yearly for birthdays).
function ScheduleForm({ d, options, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const object = String(d.object ?? "") as ObjectKey | ""
  const every = String(d.every ?? "day")
  const offset = Number(d.offset ?? 0)
  const dateFields = object ? def(object).fields.filter((f) => f.kind === "date") : []
  return (
    <div className="grid gap-3 rounded-md border p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor="sc-every">{t("automations.every")}</Label>
          <NativeSelect id="sc-every" value={every} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ every: e.target.value, time: d.time ?? "09:00" })}>
            {["day", "week", "month"].map((x) => (
              <NativeSelectOption key={x} value={x}>
                {t.dynamic(`automations.everyOptions.${x}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="sc-time">{t("automations.at")}</Label>
          <Input id="sc-time" type="time" value={String(d.time ?? "09:00")} disabled={!canEdit} onChange={(e) => onChange({ time: e.target.value, every })} />
        </div>
      </div>
      {every === "week" && (
        <NativeSelect value={String(d.weekday ?? 1)} disabled={!canEdit} aria-label={t("automations.fields.now.weekday")} className="w-full" onChange={(e) => onChange({ weekday: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <NativeSelectOption key={w} value={String(w)}>
              {t.dynamic(`automations.values.${w}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {every === "month" && (
        <div className="grid gap-1">
          <Label htmlFor="sc-md">{t("automations.monthday")}</Label>
          <Input id="sc-md" type="number" min={1} max={28} value={Number(d.monthday ?? 1)} disabled={!canEdit} onChange={(e) => onChange({ monthday: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor="sc-object">{t("automations.forEach")}</Label>
        <NativeSelect id="sc-object" value={object} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ object: e.target.value, rules: [], date_field: "", offset: 0, yearly: false })}>
          <NativeSelectOption value="">{t("automations.once")}</NativeSelectOption>
          {SCHEDULE_OBJECTS.filter((o) => def(o).module === "org" || mods.has(def(o).module)).map((o) => (
            <NativeSelectOption key={o} value={o}>
              {t.dynamic(`automations.objects.${o}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {object && (
        <>
          <p className="text-xs font-medium">{t("automations.onlyThese")}</p>
          <RulesEditor rules={(d.rules as { field: string; op: string; value: string }[]) ?? []} objects={[object]} options={options} canEdit={canEdit} onChange={(rules) => onChange({ rules })} />
          {dateFields.length > 0 && (
            <div className="grid gap-1">
              <Label htmlFor="sc-date">{t("automations.dateFilter")}</Label>
              <NativeSelect id="sc-date" value={String(d.date_field ?? "")} disabled={!canEdit} className="w-full" onChange={(e) => onChange({ date_field: e.target.value })}>
                <NativeSelectOption value="">{t("automations.noDateFilter")}</NativeSelectOption>
                {dateFields.map((f) => (
                  <NativeSelectOption key={f.key} value={f.key}>
                    {t.dynamic(`automations.fields.${object}.${f.key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {d.date_field ? (
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
                  <Input type="number" min={0} value={Math.abs(offset)} disabled={!canEdit} aria-label={t("automations.days")} onChange={(e) => onChange({ offset: (offset < 0 ? -1 : 1) * Math.abs(Math.floor(Number(e.target.value) || 0)) })} />
                  <NativeSelect value={offset < 0 ? "before" : offset > 0 ? "after" : "on"} disabled={!canEdit} aria-label={t("automations.when")} className="w-full" onChange={(e) => onChange({ offset: e.target.value === "on" ? 0 : (e.target.value === "before" ? -1 : 1) * Math.max(1, Math.abs(offset)) })}>
                    <NativeSelectOption value="before">{t("automations.daysBefore")}</NativeSelectOption>
                    <NativeSelectOption value="on">{t("automations.onTheDay")}</NativeSelectOption>
                    <NativeSelectOption value="after">{t("automations.daysAfter")}</NativeSelectOption>
                  </NativeSelect>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={!!d.yearly} disabled={!canEdit} onChange={(e) => onChange({ yearly: e.target.checked })} />
                    {t("automations.yearly")}
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
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

// The step's name: click to rename (shown on the card and, for data steps, wherever their result is picked).
function StepTitle({ value, fallback, canEdit, onChange }: { value: string; fallback: string; canEdit: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  if (editing)
    return (
      <Input
        autoFocus
        value={value}
        placeholder={fallback}
        maxLength={60}
        aria-label={t("automations.rename")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(false)}
        className="h-8"
      />
    )
  return canEdit ? (
    <button type="button" className="truncate rounded px-1 -mx-1 text-left hover:bg-muted" title={t("automations.rename")} onClick={() => setEditing(true)}>
      {value || fallback}
    </button>
  ) : (
    <span className="truncate">{value || fallback}</span>
  )
}

// Set field: object (writable ones the trigger brings) → writable field → value control that fits the field.
function SetField({ d, options, trigger, extra = [], canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const path = String(d.field ?? "")
  const { object, field } = path.includes(".") ? splitPath(path) : { object: path ? "contact" : "", field: path ? `custom.${path}` : "" }
  const objectOk = object as string
  const objects: string[] = [
    ...writableFor(trigger, new Set(options.modules)),
    ...extra.filter((k) => fieldsOf(k, options, (x) => x, true).length), // found records with writable fields
  ]
  const fields = fieldsOf(objectOk, options, (k) => t.dynamic(k), true)
  const f = fields.find((x) => x.key === field)
  return (
    <div className="grid gap-2">
      <NativeSelect value={objectOk} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ field: e.target.value ? `${e.target.value}.` : "", value: "" })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {objectLabel(o, options, (k) => t.dynamic(k))}
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
      {f && <ValueInput f={f} value={String(d.value ?? "")} options={options} dates={dateBases(objectsFor(trigger, new Set(options.modules)), (k) => t.dynamic(k))} disabled={!canEdit} onChange={(value) => onChange({ value })} />}
    </div>
  )
}

// Date fields of the run's objects, as bases for calculated dates ("membership end + 6 months").
function dateBases(objects: ObjectKey[], label: (k: string) => string): Option[] {
  return objects.flatMap((o) => def(o).fields.filter((f) => f.kind === "date").map((f) => ({ value: `{${o}.${f.key}}`, label: `${label(`automations.objects.${o}`)} · ${label(`automations.fields.${o}.${f.key}`)}` })))
}

// Condition rows: object → field → comparison that fits → value. Used by conditions and schedule filters.
function RulesEditor({
  rules,
  objects,
  options,
  canEdit,
  onChange,
  search,
  run = [],
}: {
  rules: { field: string; op: string; value: string }[]
  objects: string[] // what the rules look at
  options: EditorOptions
  canEdit: boolean
  onChange: (rules: { field: string; op: string; value: string }[]) => void
  search?: boolean // searching records: relations ("belongs to person") become pickable, values from the run (`run`)
  run?: string[] // objects of the run, for "= the person of this run" and dates of the run
}) {
  const t = useT()
  const set = (i: number, patch: Partial<(typeof rules)[number]>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const fieldsFor = (o: string) => fieldsOf(o, options, (k) => t.dynamic(k), false, search)
  const bases = dateBases([...objects, ...run].filter(isObject) as ObjectKey[], (k) => t.dynamic(k))
  // Link values: the run's object of that type, or a found record of that type.
  const linkOptions = (target?: string): Option[] => [
    ...run.filter((o) => o === target).map((o) => ({ value: `{${o}.id}`, label: t("automations.thisRuns", { what: objectLabel(o, options, (k) => t.dynamic(k)) }) })),
    ...(options.steps ?? []).filter((x) => x.object === target && run.includes(x.key)).map((x) => ({ value: `{${x.key}.id}`, label: x.label })),
  ]
  return (
    <div className="grid gap-3">
      {rules.map((r, i) => {
        const { object, field } = splitPath(r.field)
        const fields = fieldsFor(object)
        const f = fields.find((x) => x.key === field)
        const ops = f ? OPS_FOR[f.kind] : []
        return (
          <div key={i} className="grid gap-1 rounded-md border p-2">
            {objects.length > 1 && (
              <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => set(i, { field: `${e.target.value}.`, op: "eq", value: "" })}>
                <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
                {objects.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {objectLabel(o, options, (k) => t.dynamic(k))}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {(object || objects.length === 1) && (
              <NativeSelect
                value={field}
                disabled={!canEdit}
                aria-label={t("automations.field")}
                className="w-full"
                onChange={(e) => {
                  const o = object || objects[0]
                  const nf = fieldsFor(o).find((x) => x.key === e.target.value)
                  set(i, { field: `${o}.${e.target.value}`, op: nf ? OPS_FOR[nf.kind][0] : "eq", value: nf?.kind === "bool" ? "true" : "" })
                }}
              >
                <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
                {fieldsFor(object || objects[0]).map((x) => (
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
            {f && r.op !== "empty" && r.op !== "not_empty" && (
              <ValueInput f={f} value={r.value} options={options} dates={bases} links={linkOptions(f.target)} disabled={!canEdit} onChange={(value) => set(i, { value })} />
            )}
            {canEdit && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                {t("automations.removeRule")}
              </Button>
            )}
          </div>
        )
      })}
      {canEdit && rules.length < 20 && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rules, { field: objects.length === 1 ? `${objects[0]}.` : "", op: "eq", value: "" }])}>
          {t("automations.addRule")}
        </Button>
      )}
    </div>
  )
}

function ConditionForm({ d, options, trigger, extra = [], canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  return (
    <div className="grid gap-3">
      <NativeSelect value={String(d.match ?? "all")} disabled={!canEdit} onChange={(e) => onChange({ match: e.target.value })} aria-label={t("automations.match")} className="w-full">
        <NativeSelectOption value="all">{t("automations.matchAll")}</NativeSelectOption>
        <NativeSelectOption value="any">{t("automations.matchAny")}</NativeSelectOption>
      </NativeSelect>
      {!trigger && <p className="text-xs text-muted-foreground">{t("automations.pickTriggerFirst")}</p>}
      <RulesEditor rules={(d.rules as { field: string; op: string; value: string }[]) ?? []} objects={[...objectsFor(trigger, new Set(options.modules)), ...extra]} options={options} canEdit={canEdit} onChange={(rules) => onChange({ rules })} />
    </div>
  )
}

// Find record / count & calculate: object → conditions (relations to the run, dates of the run …) → first by sort,
// or count/sum/average/min/max of a number field. The result is usable by all later steps.
function DataStepForm({ type, d, options, trigger, extra = [], canEdit, onChange }: { type: "find_record" | "aggregate"; d: Record<string, unknown>; options: EditorOptions; trigger: string; extra?: string[]; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const object = String(d.object ?? "") as ObjectKey | ""
  const objects = SCHEDULE_OBJECTS.filter((o) => def(o).module === "org" || mods.has(def(o).module))
  const numbers = object ? def(object).fields.filter((f) => f.kind === "number") : []
  const sortable = object ? def(object).fields.filter((f) => f.kind === "date" || f.kind === "number" || f.kind === "text") : []
  return (
    <div className="grid gap-3">
      <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ object: e.target.value, rules: [], sort: "", field: "" })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {t.dynamic(`automations.objects.${o}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {object && (
        <>
          <p className="text-xs font-medium">{t("automations.where")}</p>
          <RulesEditor
            rules={(d.rules as { field: string; op: string; value: string }[]) ?? []}
            objects={[object]}
            options={options}
            canEdit={canEdit}
            search
            run={[...objectsFor(trigger, mods), ...extra]}
            onChange={(rules) => onChange({ rules })}
          />
          {type === "aggregate" ? (
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect value={String(d.op ?? "count")} disabled={!canEdit} aria-label={t("automations.aggOp")} className="w-full" onChange={(e) => onChange({ op: e.target.value })}>
                {["count", "sum", "avg", "min", "max"].map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {t.dynamic(`automations.aggOps.${o}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {d.op !== "count" && (
                <NativeSelect value={String(d.field ?? "")} disabled={!canEdit} aria-label={t("automations.field")} className="w-full" onChange={(e) => onChange({ field: e.target.value })}>
                  <NativeSelectOption value="">{t("automations.pickField")}</NativeSelectOption>
                  {numbers.map((f) => (
                    <NativeSelectOption key={f.key} value={f.key}>
                      {t.dynamic(`automations.fields.${object}.${f.key}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <NativeSelect value={String(d.sort ?? "")} disabled={!canEdit} aria-label={t("automations.sortBy")} className="w-full" onChange={(e) => onChange({ sort: e.target.value })}>
                <NativeSelectOption value="">{t("automations.anyOrder")}</NativeSelectOption>
                {sortable.map((f) => (
                  <NativeSelectOption key={f.key} value={f.key}>
                    {t.dynamic(`automations.fields.${object}.${f.key}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect value={String(d.dir ?? "desc")} disabled={!canEdit} aria-label={t("automations.sortDir")} onChange={(e) => onChange({ dir: e.target.value })}>
                <NativeSelectOption value="desc">{t("automations.newestFirst")}</NativeSelectOption>
                <NativeSelectOption value="asc">{t("automations.oldestFirst")}</NativeSelectOption>
              </NativeSelect>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t(type === "aggregate" ? "automations.aggHint" : "automations.findHint")}</p>
        </>
      )}
    </div>
  )
}

// Create record: object (creatable with what the run has) → its fields; links (e.g. the person) are set automatically.
function CreateRecord({ d, options, trigger, canEdit, onChange }: { d: Record<string, unknown>; options: EditorOptions; trigger: string; canEdit: boolean; onChange: (p: Data) => void }) {
  const t = useT()
  const mods = new Set(options.modules)
  const objects = creatableFor(trigger, mods)
  const object = String(d.object ?? "") as ObjectKey | ""
  const values = (d.values as Record<string, string>) ?? {}
  const spec = object ? def(object).create : undefined
  const bases = dateBases(objectsFor(trigger, mods), (k) => t.dynamic(k))
  return (
    <div className="grid gap-2">
      <NativeSelect value={object} disabled={!canEdit} aria-label={t("automations.object")} className="w-full" onChange={(e) => onChange({ object: e.target.value, values: {} })}>
        <NativeSelectOption value="">{t("automations.pickObject")}</NativeSelectOption>
        {objects.map((o) => (
          <NativeSelectOption key={o} value={o}>
            {t.dynamic(`automations.objects.${o}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {spec?.parents && Object.values(spec.parents).length > 0 && (
        <p className="text-xs text-muted-foreground">{t("automations.linkedTo", { what: Object.values(spec.parents).map((p) => t.dynamic(`automations.objects.${p}`)).join(", ") })}</p>
      )}
      {object &&
        spec?.fields.map((key) => {
          const f = def(object).fields.find((x) => x.key === key)!
          return (
            <div key={key} className="grid gap-1">
              <Label>{t.dynamic(`automations.fields.${object}.${key}`)}</Label>
              <ValueInput f={f} value={values[key] ?? ""} options={options} dates={bases} disabled={!canEdit} onChange={(v) => onChange({ values: { ...values, [key]: v } })} />
            </div>
          )
        })}
    </div>
  )
}

// A date: fixed (date picker) or calculated: base (today or a date of the run) ± N days/weeks/months/years.
// Stored as text: "2026-12-31", "today+10", "{membership.ends_on}+6m".
function DateValue({ value: full, dates, time, disabled, onChange: emit }: { value: string; dates: Option[]; time?: boolean; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT()
  // Timestamps carry " HH:MM" after the date part.
  const tm = /^(.*?)\s+(\d{2}:\d{2})$/.exec(full)
  const value = tm ? tm[1] : full
  const clock = tm ? tm[2] : ""
  const onChange = (v: string, c = clock) => emit(time && c && v ? `${v} ${c}` : v)
  const m = /^(today|\{[a-z_.]+\})(?:([+-])(\d+)([dwmy]))?$/.exec(value)
  const calc = !!m || value === "today"
  const [base, sign, n, unit] = m ? [m[1], m[2] ?? "+", m[3] ?? "0", m[4] ?? "d"] : ["today", "+", "0", "d"]
  const build = (b: string, sg: string, num: string, u: string) => onChange(Number(num) ? `${b}${sg}${Math.abs(Math.floor(Number(num)))}${u}` : b)
  return (
    <div className="grid gap-1">
      <NativeSelect value={calc ? "calc" : "fixed"} disabled={disabled} aria-label={t("automations.dateMode")} className="w-full" onChange={(e) => (e.target.value === "calc" ? onChange("today") : onChange(""))}>
        <NativeSelectOption value="fixed">{t("automations.dateFixed")}</NativeSelectOption>
        <NativeSelectOption value="calc">{t("automations.dateCalc")}</NativeSelectOption>
      </NativeSelect>
      {!calc ? (
        <Input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} disabled={disabled} aria-label={t("automations.value")} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_minmax(0,1fr)] gap-1">
          <NativeSelect value={base} disabled={disabled} aria-label={t("automations.dateBase")} className="w-full" onChange={(e) => build(e.target.value, sign, n, unit)}>
            <NativeSelectOption value="today">{t("automations.today")}</NativeSelectOption>
            {dates.map((o) => (
              <NativeSelectOption key={o.value} value={o.value}>
                {o.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect value={sign} disabled={disabled} aria-label="±" onChange={(e) => build(base, e.target.value, n, unit)}>
            <NativeSelectOption value="+">+</NativeSelectOption>
            <NativeSelectOption value="-">−</NativeSelectOption>
          </NativeSelect>
          <Input type="number" min={0} value={n} disabled={disabled} aria-label={t("automations.amount")} onChange={(e) => build(base, sign, e.target.value, unit)} />
          <NativeSelect value={unit} disabled={disabled} aria-label={t("automations.unit")} onChange={(e) => build(base, sign, n, e.target.value)}>
            {["d", "w", "m", "y"].map((u) => (
              <NativeSelectOption key={u} value={u}>
                {t.dynamic(`automations.dateUnits.${u}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      {time && <Input type="time" value={clock} disabled={disabled} aria-label={t("automations.at")} onChange={(e) => onChange(value, e.target.value)} />}
    </div>
  )
}

// The value control that fits the field: records/tags/options to pick, yes/no, date, number or text.
function ValueInput({ f, value, options, dates = [], links = [], disabled, onChange }: { f: Field; value: string; options: EditorOptions; dates?: Option[]; links?: Option[]; disabled: boolean; onChange: (v: string) => void }) {
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
  if (f.kind === "tags") return <TagPick value={value} tags={f.options ?? options.tags} disabled={disabled} onChange={onChange} />
  if (f.kind === "link") return pick(links)
  if (f.kind === "ref" && f.ref) return pick(options.refs[f.ref] ?? [])
  if (f.kind === "date") return <DateValue value={value} dates={dates} time={f.time} disabled={disabled} onChange={onChange} />
  if (f.kind === "enum")
    return pick((f.options ?? []).map((o) => ({ value: o, label: t.has(`automations.values.${o}` as never) ? t.dynamic(`automations.values.${o}`) : o })))
  return (
    <Input
      type={f.kind === "number" ? "number" : "text"}
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
