import { NextResponse } from "next/server"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { letterFileName, letterFromForm, letterPdf } from "@/letters/server"

// Download of a filled letter: the composer form posts here (template, contact, date, f.<key> values).
export async function POST(req: Request) {
  const ctx = await requirePerm("org.files.view")
  const letter = await letterFromForm(ctx, await getT(), await req.formData())
  if (!letter) return new NextResponse("Not found", { status: 404 })
  const bytes = await letterPdf(letter)
  const name = letterFileName(letter.title, letter.vars.name ?? "")
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${name.replace(/[^\p{L}\p{N} ._-]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  })
}
