"use client"

import { useEffect, useRef, useState } from "react"
import { LockIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react"
import { useT } from "@/i18n/client"
import { addToCart } from "../actions"
import { cn } from "@/lib/utils"

export type PlayerTrack = { id: string; title: string; duration?: number | null; src: string | null; buy?: boolean } // src null = buyers only; buy = sold on its own

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––")

/**
 * Bandcamp-style player: cover, big play button, the current track with a seek bar, prev/next and the tracklist
 * (click a row to play it; the next playable track follows on its own). One <audio> element, no library.
 */
export function MusicPlayer({ tracks, cover, artist, buy }: { tracks: PlayerTrack[]; cover: string | null; artist: string; buy?: { site: string; slug: string; label: string } | null }) {
  const t = useT()
  const audio = useRef<HTMLAudioElement>(null)
  const playable = tracks.map((x, i) => (x.src ? i : -1)).filter((i) => i >= 0)
  const [index, setIndex] = useState(playable[0] ?? 0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(NaN)
  const current = tracks[index]
  const total = Number.isFinite(duration) ? duration : (current?.duration ?? NaN) // stored length until the file says

  // A new track: load it and keep playing if we were.
  useEffect(() => {
    const a = audio.current
    if (!a || !current?.src) return
    setTime(0)
    setDuration(NaN)
    if (playing) a.play().catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the track changes
  }, [index])

  // Leaving the page: Next keeps visited pages alive but hidden (Activity), which runs cleanups – stop the music then.
  useEffect(() => {
    const a = audio.current
    return () => a?.pause()
  }, [])

  const go = (i: number) => {
    if (!tracks[i]?.src) return
    if (i === index) return toggle()
    setPlaying(true)
    setIndex(i)
  }
  const step = (dir: 1 | -1) => {
    const pos = playable.indexOf(index)
    const next = playable[pos + dir]
    if (next !== undefined) go(next)
    else if (dir === -1 && audio.current) audio.current.currentTime = 0
  }
  const toggle = () => {
    const a = audio.current
    if (!a || !current?.src) return
    if (a.paused) a.play().then(() => setPlaying(true), () => setPlaying(false))
    else a.pause()
  }

  if (!tracks.length) return null
  return (
    <section className="site-player grid gap-3 rounded-xl border p-3" aria-label={t("store.player")}>
      <audio
        ref={audio}
        src={current?.src ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          const next = playable[playable.indexOf(index) + 1]
          if (next !== undefined) setIndex(next)
          else setPlaying(false)
        }}
      />
      <div className="flex items-center gap-3">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
          <img src={cover} alt="" className="hidden size-16 shrink-0 rounded-md border object-cover sm:block" />
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={!playable.length}
          aria-label={playing ? t("store.pause") : t("store.play")}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40"
        >
          {playing ? <PauseIcon className="size-6 fill-current" /> : <PlayIcon className="ml-0.5 size-6 fill-current" />}
        </button>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="truncate text-sm">
            <span className="font-medium">{current?.title}</span>
            <span className="text-muted-foreground"> · {artist}</span>
          </p>
          <input
            type="range"
            min={0}
            max={Number.isFinite(total) ? total : 0}
            step={0.1}
            value={time}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.target.value)
              setTime(Number(e.target.value))
            }}
            aria-label={t("store.seek")}
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {clock(time)} / {clock(total)}
            </span>
            <span className="flex gap-1">
              <button type="button" onClick={() => step(-1)} aria-label={t("store.previous")} className="grid size-8 place-items-center rounded-md hover:bg-muted hover:text-foreground">
                <SkipBackIcon className="size-4" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label={t("store.next")} className="grid size-8 place-items-center rounded-md hover:bg-muted hover:text-foreground">
                <SkipForwardIcon className="size-4" />
              </button>
            </span>
          </div>
        </div>
      </div>
      {tracks.length > 1 && (
        <ol className="grid text-sm">
          {tracks.map((x, i) => (
            <li key={x.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => go(i)}
                title={x.src ? undefined : t("store.buyersOnly")}
                disabled={!x.src}
                className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent", i === index && x.src && "bg-muted font-medium")}
              >
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
                  {i === index && playing ? <PauseIcon className="ml-auto size-3 fill-current" /> : i + 1}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", !x.src && "text-muted-foreground")}>{x.title}</span>
                {!x.src && <LockIcon className="size-3 text-muted-foreground" aria-label={t("store.buyersOnly")} />}
                {x.duration ? <span className="text-xs text-muted-foreground tabular-nums">{clock(x.duration)}</span> : null}
              </button>
              {buy && x.buy && (
                // Single track into the cart (a digital line on its own).
                <form action={addToCart}>
                  <input type="hidden" name="site" value={buy.site} />
                  <input type="hidden" name="slug" value={buy.slug} />
                  <input type="hidden" name="item" value={x.id} />
                  <button type="submit" className="rounded-md border px-2 py-0.5 text-xs whitespace-nowrap hover:bg-muted" title={t("store.buyTrack")}>
                    {buy.label} · {t("store.buy")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
