import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { param, safeNext } from "@/lib/url"
import { sendMagicLink, signIn, signUp } from "./actions"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams
  const next = safeNext(param(sp, "next"))

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Sign in to Roots</h1>
        <p className="text-sm text-muted-foreground">Use your password, or get a sign-in link by email.</p>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={signIn} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        <Button type="submit">Sign in</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" variant="outline" formAction={signUp}>
            Create account
          </Button>
          <Button type="submit" variant="outline" formAction={sendMagicLink} formNoValidate>
            Email me a link
          </Button>
        </div>
      </form>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
