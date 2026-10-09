// Integration providers. Adding one = one file here + one entry in `integrations`
// + texts in src/i18n/messages (integrations.<key>.description, .fields.<field>, optional .help.<field>).
// Secrets (API keys, OAuth tokens) are stored as one JSON object in Supabase Vault; `config` holds non-secret settings.
import { resend } from "./resend"
import { stripeIntegration } from "./stripe"
import { telegram } from "./telegram"

export type Field = { key: string; secret?: boolean; placeholder?: string }
export type Secret = Record<string, string>
export type Config = Record<string, unknown>
export type Connection = {
  config: Config
  secret?: Secret
  expiresAt?: string
  status?: "pending" | "connected" // pending = the org still has to finish something at the provider
}
export type IncomingEvent = { externalId: string; type?: string; orgId?: string; payload: unknown }

export type Integration = {
  key: string
  name: string // brand name, not translated
  /** API-key style: fields asked in the connect dialog. */
  fields?: Field[]
  /**
   * Redirect style (OAuth, hosted onboarding): /api/integrations/[provider]/connect?mode=… calls `start`, sends the
   * user to the returned URL, and the provider sends them back to `callbackUrl` with `state`, where `finish` runs.
   * `modes` = the ways to connect (one button each, texts in integrations.<key>.modes.<mode>); first = default.
   */
  connect?: {
    modes?: string[]
    start(c: {
      mode: string
      state: string
      orgName: string
      email: string
      callbackUrl: string // without query; providers append `state` where they need to
      existing?: Config
    }): Promise<{
      url: string
      connection?: Connection // saved before redirecting (e.g. a created account id, status pending)
    }>
    finish(c: { params: URLSearchParams; callbackUrl: string; existing?: Config }): Promise<Connection>
  }
  /** Called before the connection is removed (e.g. revoke access at the provider). */
  disconnect?(c: { orgId: string; config: Config; secret: Secret | null }): Promise<void>
  /** Called after an API-key connection was saved (e.g. register a webhook at the provider). */
  onConnected?(c: { orgId: string; config: Config; secret: Secret }): Promise<void>
  /**
   * Throws an Error whose message is a message key (or plain text) if the credentials don't work.
   * May return extra non-secret config to store (e.g. the bot's username).
   */
  test?(secret: Secret, config: Config): Promise<void | Config>
  /** Handled by /api/webhooks/[provider]: verify → store in integration_events (deduped) → handle. */
  webhook?: {
    verify(req: Request, body: string): Promise<IncomingEvent>
    handle(event: IncomingEvent): Promise<void>
  }
}

export const integrations: Integration[] = [stripeIntegration, telegram, resend]

export const getIntegration = (key: string) => integrations.find((i) => i.key === key)
