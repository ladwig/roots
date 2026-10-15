import { ExternalLinkIcon } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { FormCard } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { APP_URL } from "@/lib/url"

// "Mit KI verbinden": the MCP address to copy plus one-click starts where the app supports it. Cursor and VS Code have
// install links; Claude (claude.ai / Desktop) has none, so the button opens its connector settings and the URL is
// pasted there. Signing in and picking the org happen on /oauth/consent.
export async function ConnectAi() {
  const t = await getT()
  const url = `${APP_URL}/api/mcp`
  const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=roots&config=${Buffer.from(JSON.stringify({ url })).toString("base64")}`
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "roots", type: "http", url }))}`
  const cli = `claude mcp add --transport http roots ${url}`
  const row = "flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2"
  return (
    <FormCard id="connect-ai" title={t("settings.connectAi")} description={t("settings.connectAiHint")}>
      <div className={row}>
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <CopyButton value={url} label={t("common.copy")} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button render={<a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" />} nativeButton={false} variant="outline" className="justify-between">
          {t("settings.openClaude")} <ExternalLinkIcon />
        </Button>
        <Button render={<a href={cursor} />} nativeButton={false} variant="outline" className="justify-between">
          {t("settings.installIn", { app: "Cursor" })} <ExternalLinkIcon />
        </Button>
        <Button render={<a href={vscode} />} nativeButton={false} variant="outline" className="justify-between">
          {t("settings.installIn", { app: "VS Code" })} <ExternalLinkIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.claudeSteps")}</p>
      <div className={row}>
        <code className="min-w-0 flex-1 truncate text-xs">{cli}</code>
        <CopyButton value={cli} label={t("common.copy")} />
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.claudeCodeHint")}</p>
    </FormCard>
  )
}
