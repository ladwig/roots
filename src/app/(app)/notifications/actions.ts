"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/context"

export async function markAllRead() {
  const session = await getSession()
  if (!session) return
  await session.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.userId).is("read_at", null)
  revalidatePath("/", "layout")
}
