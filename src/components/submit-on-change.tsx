"use client"

import { NativeSelect } from "@/components/ui/native-select"

// A select that submits its form when changed (e.g. a member's role).
export function SubmitOnChangeSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
