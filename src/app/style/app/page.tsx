import { MailIcon, PlusIcon, SettingsIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuLink, MenuSeparator } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { FilterMenu } from "@/components/filter-menu"
import { EmptyState, FormCard, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Segments } from "@/components/segments"
import { TypedInput } from "@/components/typed-input"
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

      <Block title="Page anatomy (Page, PageHeader, ActionsMenu)">
        <p className="text-sm text-muted-foreground">
          Right side of every header, in this order: gear (area settings) · outline actions · ⋯ menu (import, export, trash, delete in red) · the one filled main action (key N).
        </p>
        <div className="rounded-xl border p-4">
          <PageHeader
            area="contacts"
            title="Kontakte"
            meta="128 Kontakte"
            settings={{ href: "#", label: "Einstellungen" }}
            actions={
              <Button size="sm" variant="outline">
                <MailIcon /> E-Mail
              </Button>
            }
            menu={
              <ActionsMenu>
                <MenuLink href="#" icon={UploadIcon}>
                  Importieren
                </MenuLink>
                <MenuExport entity="contacts" />
                <MenuSeparator />
                <MenuLink href="#" icon={Trash2Icon} destructive>
                  In den Papierkorb
                </MenuLink>
              </ActionsMenu>
            }
            primary={{ href: "#", label: "Neuer Kontakt" }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segments label="Ansicht" items={[{ href: "#a", label: "Kommend", current: true }, { href: "#b", label: "Vergangen", current: false }, { href: "#c", label: "Alle", current: false }]} />
          <FilterMenu param="tag" label="Tags" options={[{ value: "vorstand", label: "Vorstand" }, { value: "jugend", label: "Jugend" }]} />
        </div>
        <EmptyState area="contacts" title="Noch keine Kontakte." text="Empty lists explain what belongs here and offer the first step." action={<Button size="sm"><PlusIcon /> Neuer Kontakt</Button>} />
      </Block>

      <Block title="Forms (FormCard, TypedInput, Choice, SaveBar)">
        <form className="grid gap-6">
          <FormCard id="demo-bank" title="Bank & SEPA" description="Fields that belong together sit in one card with a title and one line of help.">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="grid content-start gap-2">
                <Label htmlFor="d-iban">IBAN</Label>
                <TypedInput kind="iban" id="d-iban" name="iban" />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="d-bic">BIC</Label>
                <TypedInput kind="bic" id="d-bic" name="bic" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid content-start gap-2">
                <Label htmlFor="d-money">Betrag</Label>
                <TypedInput kind="money" id="d-money" name="amount" />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="d-zip">PLZ</Label>
                <TypedInput kind="postcode" id="d-zip" name="zip" />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="d-date">Datum</Label>
                <TypedInput kind="date" id="d-date" name="date" />
              </div>
            </div>
          </FormCard>
          <FormCard id="demo-choice" title="Choice" description="≤ 5 options: segments · 6–15: dropdown · more: search.">
            <Choice name="interval" required defaultValue="year" options={[{ value: "month", label: "Monatlich" }, { value: "quarter", label: "Quartal" }, { value: "year", label: "Jährlich" }]} />
            <Choice name="country" label="Land" options={["DE", "AT", "CH", "NL", "BE", "FR", "IT", "ES", "PL", "CZ", "DK", "SE", "NO", "GB", "IE", "US"].map((c) => ({ value: c, label: c }))} />
          </FormCard>
          <SaveBar />
        </form>
      </Block>

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
