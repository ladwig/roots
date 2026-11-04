// Shop music (Bandcamp-style), shared by the App, the key API, the public pages and the audio worker. Files live in R2
// (src/lib/r2.ts): the org uploads a lossless master per track straight from the browser (startTrackUpload → PUT →
// finishTrackUpload); /api/cron/audio converts it (stream MP3 for the player; MP3 320 + WAV for buyers) and then
// builds one album ZIP (WAV + MP3 320 folders). Rows: product_tracks + products.audio_zips. Callers check permissions;
// every query filters by org (the key API's client bypasses RLS).
import { createWriteStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/types"
import { APP_URL } from "@/lib/url"
import { headSize, presign, r2Ready, removeKeys, uploadFile, uploadStream } from "@/lib/r2"
import { convertArgs, DOWNLOAD_FORMATS, durationOf, EXT, ffmpeg, MIME, titleFromFile, type Format } from "./convert"

type Db = SupabaseClient<Database>
type Stored = { key: string; size: number }
export type TrackRow = { id: string; title: string; position: number; stream: boolean; status: string; error: string | null; master_name: string; master_size: number | null; duration_seconds: number | null; formats: Partial<Record<Format, Stored>> }

export const MASTER_EXT = ["wav", "aif", "aiff", "flac"] as const
export const MAX_MASTER = 250 * 1024 * 1024 // the worker holds master + outputs in /tmp (500 MB)
const TRACK_COLS = "id, title, position, stream, status, error, master_name, master_size, duration_seconds, formats"
const prefix = (orgId: string, productId: string) => `audio/${orgId}/${productId}`
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 120) || "track"
const nn = (i: number) => String(i + 1).padStart(2, "0")

export async function productTrackList(db: Db, orgId: string, productId: string): Promise<TrackRow[]> {
  const { data } = await db.from("product_tracks").select(TRACK_COLS).eq("org_id", orgId).eq("product_id", productId).order("position").order("created_at")
  return (data ?? []) as TrackRow[]
}


/** New track: the row ("uploading") + a one-hour PUT link the browser uploads the master to. */
export async function startTrackUpload(db: Db, orgId: string, productId: string, file: { name: string; size: number }) {
  if (!r2Ready()) return { error: "store.audioNotConfigured" } as const
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!(MASTER_EXT as readonly string[]).includes(ext)) return { error: "store.audioType" } as const
  if (!(file.size > 0 && file.size <= MAX_MASTER)) return { error: "store.audioTooBig" } as const
  const { data: p } = await db.from("products").select("id").eq("id", productId).eq("org_id", orgId).maybeSingle()
  if (!p) return { error: "errors.not_found" } as const
  const { count } = await db.from("product_tracks").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("org_id", orgId)
  const id = crypto.randomUUID()
  const key = `${prefix(orgId, productId)}/${id}/master.${ext}`
  const { error } = await db.from("product_tracks").insert({ id, org_id: orgId, product_id: productId, title: titleFromFile(file.name).slice(0, 200), position: (count ?? 0) + 1, master_key: key, master_name: file.name.slice(0, 300) })
  if (error) return { error: "db", db: error } as const
  return { id, uploadUrl: await presign(key, "PUT", 3600) }
}

/** The browser finished the PUT: check the file is there, queue the conversion and start the worker. */
export async function finishTrackUpload(db: Db, orgId: string, trackId: string) {
  const { data: t } = await db.from("product_tracks").select("id, product_id, master_key, status").eq("id", trackId).eq("org_id", orgId).maybeSingle()
  if (!t) return { error: "errors.not_found" } as const
  const size = await headSize(t.master_key)
  if (!size) return { error: "store.audioMissing" } as const
  const { error } = await db.from("product_tracks").update({ status: "pending", master_size: size, error: null, formats: {} }).eq("id", trackId).eq("org_id", orgId)
  if (error) return { error: "db", db: error } as const
  await staleZips(t.product_id)
  kickAudio()
  return { ok: true } as const
}

export async function updateTrack(db: Db, orgId: string, trackId: string, patch: { title?: string; position?: number; stream?: boolean }) {
  const row: { title?: string; position?: number; stream?: boolean } = {}
  if (patch.title !== undefined) row.title = patch.title.trim().slice(0, 200)
  if (patch.title !== undefined && !row.title) return { error: "store.trackTitleRequired" } as const
  if (patch.position !== undefined) row.position = Math.max(0, Math.min(999, Math.floor(patch.position)))
  if (patch.stream !== undefined) row.stream = patch.stream
  const { data, error } = await db.from("product_tracks").update(row).eq("id", trackId).eq("org_id", orgId).select("product_id").maybeSingle()
  if (error) return { error: "db", db: error } as const
  if (!data) return { error: "errors.not_found" } as const
  if (row.title !== undefined || row.position !== undefined) await staleZips(data.product_id) // names/order inside the ZIPs
  return { ok: true } as const
}

export async function deleteTrack(db: Db, orgId: string, trackId: string) {
  const { data: t } = await db.from("product_tracks").select("product_id, master_key, formats").eq("id", trackId).eq("org_id", orgId).maybeSingle()
  if (!t) return { error: "errors.not_found" } as const
  const { error } = await db.from("product_tracks").delete().eq("id", trackId).eq("org_id", orgId)
  if (error) return { error: "db", db: error } as const
  await removeKeys([...new Set([t.master_key, ...Object.values((t.formats ?? {}) as Record<string, Stored>).map((f) => f.key)])]).catch(console.error)
  await staleZips(t.product_id)
  return { ok: true } as const
}

// Tracks changed: the album ZIPs are rebuilt (the old ones go away now; a running build notices and doesn't save).
async function staleZips(productId: string, kick = true) {
  const db = createAdminClient()
  const { data: p } = await db.from("products").select("audio_zips").eq("id", productId).single()
  await db.from("products").update({ audio_zips: {}, audio_zips_claimed_at: null }).eq("id", productId)
  const keys = Object.values((p?.audio_zips ?? {}) as Record<string, Stored>).map((z) => z.key)
  if (keys.length) await removeKeys(keys).catch(console.error)
  if (kick) kickAudio()
}

/** Start the audio worker now (it runs on its own route, the only one that ships ffmpeg); the minute worker is the backup. */
export function kickAudio() {
  if (!process.env.CRON_SECRET) return
  after(() => fetch(`${APP_URL}/api/cron/audio`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then(() => {}, console.error))
}

// ---------- the worker ----------

/** Converts queued tracks, then builds missing ZIPs, until nothing is due or the time budget is used. */
export async function processAudio(ffmpegPath: string, budgetMs = 240_000) {
  const db = createAdminClient()
  const end = Date.now() + budgetMs
  let done = 0
  while (Date.now() < end - 60_000) {
    const { data: t } = await db.rpc("claim_audio_track")
    if (t?.id) {
      await convertTrack(ffmpegPath, t).catch(async (e) => {
        console.error("audio convert", t.id, e)
        await db.from("product_tracks").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", t.id)
      })
      done++
      continue
    }
    const { data: productId } = await db.rpc("claim_audio_zips")
    if (!productId) break
    await buildZips(productId).catch(async (e) => {
      console.error("audio zips", productId, e)
      await db.from("products").update({ audio_zips_claimed_at: null }).eq("id", productId) // retried on the next run
    })
    done++
  }
  return done
}

async function convertTrack(ffmpegPath: string, t: Database["public"]["Tables"]["product_tracks"]["Row"]) {
  const db = createAdminClient()
  const dir = await mkdtemp(join(tmpdir(), "track-"))
  try {
    const ext = t.master_key.split(".").pop()!
    const master = join(dir, `master.${ext}`)
    const res = await fetch(await presign(t.master_key, "GET", 900))
    if (!res.ok || !res.body) throw new Error(`master not readable (${res.status})`)
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(master))
    const { data: p } = await db.from("products").select("name").eq("id", t.product_id).single()
    const { formats, args } = convertArgs(master, (f) => join(dir, `${f}.${EXT[f]}`), { title: t.title, album: p?.name ?? "", track: String(t.position) }, ext === "wav")
    const log = await ffmpeg(ffmpegPath, args)
    const base = t.master_key.replace(/\/master\.[a-z0-9]+$/, "")
    const out: Partial<Record<Format, Stored>> = {}
    for (const f of formats) {
      const key = `${base}/${f}.${EXT[f]}`
      out[f] = { key, size: await uploadFile(key, join(dir, `${f}.${EXT[f]}`), MIME[f]) }
    }
    if (ext === "wav") out.wav = { key: t.master_key, size: (await stat(master)).size }
    await db.from("product_tracks").update({ status: "ready", error: null, formats: out, duration_seconds: durationOf(log), claimed_at: null }).eq("id", t.id).eq("status", "processing")
    await staleZips(t.product_id, false) // the running worker builds them next
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function buildZips(productId: string) {
  const db = createAdminClient()
  const { data: p } = await db.from("products").select("id, org_id, name, audio_zips_claimed_at").eq("id", productId).single()
  if (!p) return
  const { data } = await db.from("product_tracks").select("title, position, formats").eq("product_id", productId).eq("status", "ready").order("position").order("created_at")
  const tracks = (data ?? []) as { title: string; formats: Partial<Record<Format, Stored>> }[]
  // One ZIP with a folder per format: "WAV/01 Gasp.wav", "MP3 320/01 Gasp.mp3".
  const folder = { wav: "WAV", mp3: "MP3 320" } as const
  const files = (["wav", "mp3"] as const).flatMap((f) => tracks.flatMap((t, i) => (t.formats[f] ? [{ name: `${folder[f]}/${nn(i)} ${safeName(t.title)}.${EXT[f]}`, size: t.formats[f]!.size, key: t.formats[f]!.key }] : [])))
  const { downloadZip, predictLength } = await import("client-zip")
  async function* inputs() {
    for (const x of files) yield { name: x.name, size: x.size, input: (await fetch(await presign(x.key, "GET", 900))).body! }
  }
  const key = `${prefix(p.org_id, p.id)}/album.zip`
  const body = downloadZip(inputs(), { length: predictLength(files.map(({ name, size }) => ({ name, size }))) }).body!
  const zips = files.length ? { zip: { key, size: await uploadStream(key, body as unknown as AsyncIterable<Uint8Array>, "application/zip") } } : {}
  // Only if nothing changed meanwhile (a change clears the claim): else the next run builds again.
  await db.from("products").update({ audio_zips: zips, audio_zips_claimed_at: null }).eq("id", productId).eq("audio_zips_claimed_at", p.audio_zips_claimed_at!)
}

// ---------- public: player + buyers ----------

/** What the player shows: ready tracks in order, with a stream link for the ones the org lets play. */
export async function playerTracks(orgId: string, productId: string) {
  const tracks = (await productTrackList(createAdminClient(), orgId, productId)).filter((t) => t.status === "ready")
  return tracks.map((t) => ({ id: t.id, title: t.title, duration: t.duration_seconds, stream: t.stream && !!t.formats.stream }))
}

export async function streamUrl(orgId: string, productId: string, trackId: string) {
  const t = (await productTrackList(createAdminClient(), orgId, productId)).find((x) => x.id === trackId && x.stream && x.status === "ready")
  return t?.formats.stream ? presign(t.formats.stream.key, "GET", 3600) : null
}

export type BuyerAudio = { productId: string; name: string; zip: number | null; tracks: { id: string; title: string; sizes: Partial<Record<(typeof DOWNLOAD_FORMATS)[number], number>> }[] }

/** The music of the products in a paid order (caller checks the order is paid and the buyer's token). */
export async function orderAudio(orgId: string, productIds: string[]): Promise<BuyerAudio[]> {
  if (!productIds.length) return []
  const db = createAdminClient()
  const [{ data: products }, { data: tracks }] = await Promise.all([
    db.from("products").select("id, name, audio_zips").eq("org_id", orgId).in("id", productIds),
    db.from("product_tracks").select("id, product_id, title, formats").eq("org_id", orgId).in("product_id", productIds).eq("status", "ready").order("position").order("created_at"),
  ])
  const sizes = (f: Record<string, Stored>) => Object.fromEntries(DOWNLOAD_FORMATS.flatMap((k) => (f[k] ? [[k, f[k].size]] : [])))
  return (products ?? []).flatMap((p) => {
    const own = (tracks ?? []).filter((t) => t.product_id === p.id)
    return own.length ? [{ productId: p.id, name: p.name, zip: ((p.audio_zips ?? {}) as Record<string, Stored>).zip?.size ?? null, tracks: own.map((t) => ({ id: t.id, title: t.title, sizes: sizes((t.formats ?? {}) as Record<string, Stored>) })) }] : []
  })
}

/** A download link, named for the buyer: the album ZIP (`zip`) or one track (trackId) as `mp3` | `wav`. */
export async function audioDownloadUrl(orgId: string, productId: string, format: string, trackId: string | null) {
  const db = createAdminClient()
  const { data: p } = await db.from("products").select("name, audio_zips").eq("id", productId).eq("org_id", orgId).maybeSingle()
  if (!p) return null
  if (format === "zip") {
    const z = ((p.audio_zips ?? {}) as Record<string, Stored>).zip
    return z ? presign(z.key, "GET", 600, `${safeName(p.name)}.zip`) : null
  }
  if (!(DOWNLOAD_FORMATS as readonly string[]).includes(format) || !trackId) return null
  const f = format as (typeof DOWNLOAD_FORMATS)[number]
  const list = await productTrackList(db, orgId, productId)
  const i = list.filter((t) => t.status === "ready").findIndex((t) => t.id === trackId)
  const t = list.filter((x) => x.status === "ready")[i]
  return t?.formats[f] ? presign(t.formats[f]!.key, "GET", 600, `${nn(i)} ${safeName(t.title)}.${EXT[f]}`) : null
}
