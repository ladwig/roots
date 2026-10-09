// Integration providers. Adding one = one file here + one entry in `integrations`
// + texts in src/i18n/messages (integrations.<key>.description, .fields.<field>, optional .help.<field>).
// Secrets (API keys, OAuth tokens) are stored as one JSON object in Supabase Vault; `config` holds non-secret settings.
import { resend } from "./resend"
import { stripeIntegration } from "./stripe"

export type Field = { key: string; secret?: boolean; placeholder?: string }
export type Secret = Record<string, string>
export type Connection = {
  config: Record<string, string>
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
      existing?: Record<string, string>
    }): Promise<{
      url: string
      connection?: Connection // saved before redirecting (e.g. a created account id, status pending)
    }>
    finish(c: { params: URLSearchParams; callbackUrl: string; existing?: Record<string, string> }): Promise<Connection>
  }
  /** Called before the connection is removed (e.g. revoke access at the provider). */
  disconnect?(config: Record<string, string>): Promise<void>
  /** Throws an Error whose message is a message key (or plain text) if the credentials don't work. */
  test?(secret: Secret, config: Record<string, string>): Promise<void>
  /** Handled by /api/webhooks/[provider]: verify → store in integration_events (deduped) → handle. */
  webhook?: {
    verify(req: Request, body: string): Promise<IncomingEvent>
    handle(event: IncomingEvent): Promise<void>
  }
}

export const integrations: Integration[] = [stripeIntegration, resend]

export const getIntegration = (key: string) => integrations.find((i) => i.key === key)
