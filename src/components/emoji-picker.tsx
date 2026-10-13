"use client"

import { EmojiPicker as Picker } from "frimousse"
import { useT } from "@/i18n/client"

// Emoji picker with categories, search and skin tones (frimousse, styled with our tokens). Emoji data comes from
// emojibase via its CDN on first open (cached by the browser).
export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const t = useT()
  return (
    <Picker.Root locale={t.locale === "de" ? "de" : "en"} columns={9} onEmojiSelect={({ emoji }) => onSelect(emoji)} className="isolate flex h-[340px] w-fit flex-col bg-popover">
      <Picker.Search placeholder={t("emoji.search")} className="z-10 mx-2 mt-2 appearance-none rounded-md bg-muted px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      <Picker.Viewport className="relative flex-1 outline-none">
        <Picker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{t("emoji.loading")}</Picker.Loading>
        <Picker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{t("emoji.none")}</Picker.Empty>
        <Picker.List
          className="pb-1.5 select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-muted" {...props}>
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </Picker.Viewport>
    </Picker.Root>
  )
}
