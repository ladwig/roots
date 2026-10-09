import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { modules } from "@/modules/registry"

export default async function HomePage() {
  const ctx = await getContext()
  const t = await getT()
  const enabled = modules.filter((m) => ctx.modules.has(m.key))

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">{ctx.org.name}</h1>
        <p className="text-sm text-muted-foreground">{t("home.role", { role: ctx.role.name })}</p>
      </div>
      <section className="grid gap-3">
        <h2 className="font-medium">{t("home.modules")}</h2>
        {enabled.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {enabled.map((m) => (
              <li key={m.key} className="rounded-lg border p-4">
                <p className="font-medium">{t.dynamic(`modules.${m.key}.name`)}</p>
                <p className="text-sm text-muted-foreground">{t.dynamic(`modules.${m.key}.description`)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("home.noModules")}</p>
        )}
      </section>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
