import type { T } from "@/i18n/translate"
import { MAIL_KINDS } from "@/shop/fields"

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

// The shop's buyer mails (on/off + own text per kind). Shown in Shop → Einstellungen and E-Mail → Vorlagen, same data.
export function ShopMailFields({ t, mails }: { t: T; mails: Record<string, { off?: boolean; message?: string }> }) {
  return (
    <>
      {MAIL_KINDS.map((k) => (
        <div key={k} className="grid gap-2 rounded-lg border p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name={`mail_${k}`} value="1" defaultChecked={!mails[k]?.off} className="mt-0.5 size-4 accent-primary" />
            <span>
              {t.dynamic(`store.mailKinds.${k}`)}
              <span className="block text-xs text-muted-foreground">{t.dynamic(`store.mailWhen.${k}`)}</span>
            </span>
          </label>
          <textarea
            name={`mail_${k}_message`}
            rows={2}
            maxLength={2000}
            defaultValue={mails[k]?.message ?? ""}
            placeholder={t.dynamic(`store.mail.${k}.message`, { number: "{number}", name: "{name}", total: "{total}", org: "{org}" })}
            aria-label={t("store.mailText")}
            className={textarea}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("store.mailTemplateHint")}</p>
    </>
  )
}
