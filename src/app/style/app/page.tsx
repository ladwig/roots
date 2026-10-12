import { PlusIcon, SettingsIcon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { RichTextEditor } from "@/components/rich-text-editor"
import { SubmitButton } from "@/components/submit-button"
import { TagSelect } from "@/components/tag-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ToastDemo } from "./demos"

// The App's look: shadcn/ui (Base UI) + tokens in src/app/theme.css. Rules: AGENTS.md › Design system.
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
      <Separator className="mt-4" />
    </section>
  )
}

const TOKENS = ["background", "foreground", "card", "muted", "muted-foreground", "primary", "primary-foreground", "secondary", "accent", "destructive", "border", "input", "ring"]

export default function AppStyle() {
  const rows = [
    { id: "1", name: "Lena Krüger", email: "lena@example.org", tags: ["Vorstand"] },
    { id: "2", name: "Murat Yılmaz", email: "murat@example.org", tags: ["Jugend", "Trainer"] },
    { id: "3", name: "Sophie Wagner", email: "sophie@example.org", tags: [] },
  ]
  return (
    <main className="grid max-w-5xl gap-10 px-6 py-12">
      <header className="grid gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">App style</h1>
        <p className="text-muted-foreground">Tokens in src/app/theme.css, components in src/components/ui (shadcn on Base UI). Toggle dark mode in the profile.</p>
      </header>

      <Block title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
          {TOKENS.map((t) => (
            <div key={t} className="grid gap-1.5">
              <div className="h-14 rounded-lg border" style={{ background: `var(--${t})` }} />
              <span className="text-xs text-muted-foreground">{t}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type">
        <div className="grid gap-2">
          <p className="font-heading text-3xl font-semibold tracking-tight">Page title (font-heading 3xl)</p>
          <p className="text-xl font-medium">Section title (xl medium)</p>
          <p>Body text (base). Mitglieder, Tickets, Schichten.</p>
          <p className="text-sm text-muted-foreground">Secondary text (sm muted-foreground)</p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button>default</Button>
          <Button size="lg">lg</Button>
          <Button size="sm">
            <PlusIcon /> With icon
          </Button>
          <Tooltip>
            <TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Settings" />}>
              <SettingsIcon />
            </TooltipTrigger>
            <TooltipContent>Icon buttons get a tooltip + aria-label</TooltipContent>
          </Tooltip>
          <form>
            <SubmitButton size="sm">SubmitButton (spinner while pending)</SubmitButton>
          </form>
        </div>
      </Block>

      <Block title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Block>

      <Block title="Forms">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Input</Label>
            <Input id="s-name" placeholder="Name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-sel">NativeSelect</Label>
            <NativeSelect id="s-sel" className="w-full">
              <NativeSelectOption>Vollmitglied</NativeSelectOption>
              <NativeSelectOption>Ermäßigt</NativeSelectOption>
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Checkbox
          </label>
        </div>
        <div className="grid max-w-xl gap-2">
          <Label>TagSelect (pick, optionally create)</Label>
          <TagSelect name="tags" options={["Vorstand", "Jugend", "Trainer", "Newsletter"]} defaultValue={["Jugend"]} creatable />
        </div>
        <div className="grid max-w-2xl gap-2">
          <Label>RichTextEditor</Label>
          <RichTextEditor name="body" defaultValue="<p>Hallo <strong>{first_name}</strong>,</p>" placeholders={["first_name", "org"]} />
        </div>
      </Block>

      <Block title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Card description</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Content</CardContent>
          </Card>
          <div className="grid gap-2 rounded-xl border p-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <span className="text-xs text-muted-foreground">Skeleton (loading.tsx)</span>
          </div>
        </div>
      </Block>

      <Block title="DataTable (cards on phones, table from md)">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="Nothing here yet."
          columns={[
            { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "Email", cell: (r) => r.email },
            {
              header: "Tags",
              cell: (r) => (
                <span className="flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </span>
              ),
            },
          ]}
        />
      </Block>

      <Block title="Feedback">
        <ToastDemo />
      </Block>
    </main>
  )
}
