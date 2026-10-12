import Image from "next/image"
import Link from "next/link"
import { Notice } from "@/components/notice"
import { LocaleSwitcher } from "@/i18n/client"
import { HalftoneGlint } from "@/app/site/_components/halftone"
import { getT } from "@/i18n/server"
import { param, safeNext } from "@/lib/url"
import { SiteShell } from "@/app/site/_components/site-shell"
import { SiteSubmit } from "@/app/site/_components/site-submit"
import { PAINTINGS } from "@/app/site/paintings"
import { sendMagicLink, signIn, signUp } from "./actions"
import { titled } from "@/lib/title"

export const generateMetadata = titled("auth.signIn")

// Sign-in in the website's look: form on the left, a painting on the right (desktop).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams
  const t = await getT()
  const next = safeNext(param(sp, "next"))
  const art = PAINTINGS.turf

  return (
    <SiteShell className="grid lg:grid-cols-2">
      <main className="flex min-h-dvh flex-col px-[clamp(20px,5vw,72px)] py-8">
        <Link href="/" className="wordmark text-[26px]">
          roots
        </Link>
        <div className="mx-auto my-auto grid w-full max-w-[440px] gap-8 py-12 sm:border sm:border-[var(--line)] sm:rounded-[10px] sm:bg-white sm:p-10">
          <div className="grid gap-3">
            <h1 className="display text-[clamp(36px,4vw,48px)]">{t("auth.title")}</h1>
            <p className="soft">{t("auth.subtitle")}</p>
          </div>
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          <form action={signIn} className="grid gap-5">
            <input type="hidden" name="next" value={next} />
            <div className="grid gap-2">
              <label htmlFor="email" className="label soft">
                {t("auth.email")}
              </label>
              <input id="email" name="email" type="email" autoComplete="email" required className="field" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="password" className="label soft">
                  {t("auth.password")}
                </label>
                <Link href="/forgot" className="link soft text-[13px]">
                  {t("auth.forgot")}
                </Link>
              </div>
              <input id="password" name="password" type="password" autoComplete="current-password" className="field" />
            </div>
            <SiteSubmit className="w-full">{t("auth.signIn")}</SiteSubmit>
            <div className="grid grid-cols-2 gap-2">
              <SiteSubmit variant="outline" formAction={signUp}>
                {t("auth.signUp")}
              </SiteSubmit>
              <SiteSubmit variant="outline" formAction={sendMagicLink} formNoValidate>
                {t("auth.magicLink")}
              </SiteSubmit>
            </div>
          </form>
        </div>
        <LocaleSwitcher className="justify-self-start" />
      </main>
      <aside className="painting relative hidden overflow-hidden min-h-dvh rounded-none! lg:block">
        <Image src={art.src} alt={`${art.artist}, ${art.title}`} fill priority sizes="50vw" className="scale-[1.08] object-cover" style={{ objectPosition: "50% 60%" }} />
        <HalftoneGlint src={art.src} y={0.6} className="absolute inset-0 z-[1] size-full scale-[1.08] [filter:drop-shadow(0_0_4px_rgb(255_244_214/.7))]" />
        <p className="absolute right-6 bottom-5 z-[2] text-[12px] text-white [text-shadow:0_1px_3px_rgb(0_0_0/.45)]">
          {art.artist}, <em>{art.title}</em>, {art.year}
        </p>
      </aside>
    </SiteShell>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
