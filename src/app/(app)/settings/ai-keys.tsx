import { Trash2Icon } from "lucide-react"
import { PROVIDERS, type Provider } from "@/assistant/providers"
import { FormCard } from "@/components/page"
import { ProviderLogo } from "@/components/provider-logo"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { SproutRefresh } from "@/components/sprout/refresh"
import { deleteAiKeyAction, saveAiKeyAction } from "./ai-actions"

/** Profile → KI-Assistent: the person's own API keys (one per provider); Sprout offers their models. */
export async function AiKeys({ ctx }: { ctx: Awaited<ReturnType<typeof getContext>> }) {
  const t = await getT()
  const { data: keys } = await ctx.supabase.from("ai_keys").select("provider, hint, models, updated_at").eq("user_id", ctx.userId).order("provider")
  return (
    <FormCard id="ai" title={t("sprout.keysTitle")} description={t("sprout.keysHint")}>
      <SproutRefresh stamp={(keys ?? []).map((k) => `${k.provider}${k.updated_at}`).join()} />
      {(keys ?? []).length > 0 && (
        <ul className="grid gap-1.5">
          {(keys ?? []).map((k) => (
            <li key={k.provider} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <ProviderLogo provider={k.provider as Provider} />
              <span className="font-medium">{PROVIDERS[k.provider as Provider]?.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{k.hint}</span>
              <span className="text-xs text-muted-foreground">{t("sprout.modelCount", { count: Array.isArray(k.models) ? k.models.length : 0 })}</span>
              <form action={deleteAiKeyAction} className="ml-auto">
                <input type="hidden" name="provider" value={k.provider} />
                <SubmitButton variant="ghost" size="icon-sm" aria-label={t("sprout.deleteKey")} data-confirm="sprout.confirmDeleteKey" className="text-destructive hover:text-destructive">
                  <Trash2Icon />
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={saveAiKeyAction} className="grid gap-2">
        <Label htmlFor="ai-key">{t("sprout.addKey")}</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="ai-key" name="key" type="password" autoComplete="off" required placeholder="sk-ant-… · sk-… · AIza… · xai-…" className="min-w-0 flex-1 font-mono" />
          <SubmitButton>{t("sprout.saveKey")}</SubmitButton>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <ProviderLogo provider={p} className="size-3.5" /> {PROVIDERS[p].label}
            </span>
          ))}
        </p>
      </form>
    </FormCard>
  )
}
