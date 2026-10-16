// Ready-made MCP prompts: guided setups Claude walks through with the person (shown as "/" commands or the "+" menu
// in Claude). Each is a checklist over existing operations; Claude asks for what's missing before it writes.
// Paths instead of operation names so the text survives renames (roots_find_operations shows both).

const ASK = `Work like a helpful setup assistant: first read what already exists, then ask the person in one short message for everything you still need (offer sensible defaults they can just accept), then create it with roots_write (batch with calls: [...]), and finish with a short summary with the app_url links. Speak the person's language (usually German). Never invent prices, dates, bank details or email addresses; ask.`

type Prompt = { name: string; title: string; description: string; args?: { name: string; description: string }[]; text: (a: Record<string, string>) => string }

export const PROMPTS: Prompt[] = [
  {
    name: "verein_einrichten",
    title: "Verein einrichten",
    description: "Sets up a club in roots step by step: own fields, membership types and fees, team invites, a membership form and a welcome email.",
    args: [{ name: "about", description: "A few words about the club (optional)" }],
    text: (a) => `Help me set up our organisation in roots${a.about ? ` (${a.about})` : ""}. ${ASK}

Checklist (skip what doesn't apply, ask before each block):
1. Overview: roots_whoami; GET /custom-fields, GET /membership-types, GET /member-settings, GET /org-members, GET /invites, GET /forms.
2. Own fields for contacts (e.g. Geburtstag, T-Shirt-Größe, Abteilung): ask which, then POST /custom-fields (entity contacts; select needs options).
3. Membership types and fees: name, amount in cents, interval, notice period → POST /membership-types. Creditor data for SEPA (name, IBAN, creditor ID) → PATCH /member-settings, only with values the person gives.
4. Team: GET /roles, ask who should get access with which role → POST /invites (roots_danger: it emails them; owner roles only in the App).
5. Membership form: POST /forms with purpose membership (fields: name, email, address, membership type, SEPA mandate, consent); tell the person the public link and that new submissions are accepted under Formulare → Einsendungen.
6. Welcome email: GET /email/automation-events, then POST /email/automations on the membership-accepted event (subject + friendly text with placeholders). Created inactive; switch on only after the person read it.
7. Summary: what was created (links), what's still open (e.g. importing existing members: prompt mitglieder_importieren).`,
  },
  {
    name: "mitglieder_importieren",
    title: "Mitglieder importieren",
    description: "Imports existing members (or plain contacts) from a list or CSV the person pastes or attaches.",
    args: [{ name: "data", description: "Pasted CSV / list (optional, can also come in the chat)" }],
    text: (a) => `Import our existing members into roots. ${ASK}

1. Get the data: ${a.data ? "it is below" : "ask the person to paste the CSV / table or attach it"}. Show how you understood the columns (name, email, address, birthday, member since, membership type, IBAN …) for the first 3 rows and ask if that's right.
2. Read GET /membership-types and GET /custom-fields; map columns to them. Unknown types or fields: ask whether to create them (POST /membership-types, POST /custom-fields) or leave them out.
3. Members (with a membership) → POST /members/import; only contacts → POST /contacts/import. Import in chunks (≤ 500 rows), report rows with errors and ask how to fix them instead of guessing.
4. Bank data only from the source, never made up. Members without IBAN simply have no mandate.
5. Summary: how many imported, which rows were skipped and why, link to the members list.${a.data ? `\n\nData:\n${a.data}` : ""}`,
  },
  {
    name: "event_erstellen",
    title: "Event erstellen",
    description: "Creates an event with description, picture, tickets (types, prices, quotas), optional discount codes and publishes it when ready.",
    args: [{ name: "about", description: "What, when, where (optional)" }],
    text: (a) => `Create an event in roots${a.about ? `: ${a.about}` : ""}. ${ASK}

Ask for (with suggestions where you can): title, date + start/end time (Europe/Berlin), place (GET /locations or a venue name + address), a description (offer to write it from a few keywords and show it first), capacity, free or paid; for paid: ticket types with price, quota, sale period, max. per order, early-bird tiers, discount codes; a picture (an image URL, or the person attaches one).
Then:
1. POST /events (status draft).
2. Picture: events_image_set with image_url (https) or image_base64; if the person pasted the picture into the chat, call it without both and give them the upload link. It is shown back to you, check it fits.
3. Tickets: POST /events/{id}/ticket-types (prices in cents), tiers POST /ticket-types/{id}/tiers, codes POST /events/{id}/ticket-codes. Free events: one free type means "Anmeldung".
4. Lineup / programme if it has one: POST /events/{id}/slots, artists POST /artists.
5. Show a compact summary (date, place, tickets + prices, link) and ask whether to publish; only then PATCH /events/{id} { status: "published" }.`,
  },
]

export const promptList = () => PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description, arguments: (p.args ?? []).map((x) => ({ ...x, required: false })) }))

export function getPrompt(name: string, args: Record<string, string> = {}) {
  const p = PROMPTS.find((x) => x.name === name)
  if (!p) return null
  return { description: p.description, messages: [{ role: "user" as const, content: { type: "text" as const, text: p.text(args) } }] }
}
