// Integration providers. Adding one = one file here + one entry in `integrations`
// + texts in src/i18n/messages (integrations.<key>.description, .fields.<field>, optional .help.<field>).
// Secrets (API keys, OAuth tokens) are stored as one JSON object in Supabase Vault; `config` holds non-secret settings.
import { resend } from "./resend"

export type Field = { key: string; secret?: boolean; placeholder?: string }
export type Secret = Record<string, string>
export type Connection = { config: Record<string, string>; secret?: Secret; expiresAt?: string }
export type IncomingEvent = { externalId: string; type?: string; orgId?: string; payload: unknown }

export type Integration = {
  key: string
  name: string // brand name, not translated
  /** API-key style: fields asked in the connect dialog. */
  fields?: Field[]
  /** OAuth style: handled by /api/integrations/[provider]/connect + /callback. */
  oauth?: {
    authorizeUrl(state: string, redirectUri: string): string
    exchange(code: string, redirectUri: string): Promise<Connection>
  }
  /** Throws an Error whose message is a message key (or plain text) if the credentials don't work. */
  test?(secret: Secret, config: Record<string, string>): Promise<void>
  /** Handled by /api/webhooks/[provider]: verify → store in integration_events (deduped) → handle. */
  webhook?: {
    verify(req: Request, body: string): Promise<IncomingEvent>
    handle(event: IncomingEvent): Promise<void>
  }
}

export const integrations: Integration[] = [resend]

export const getIntegration = (key: string) => integrations.find((i) => i.key === key)
