import { connection } from "next/server"
import { UploadIcon } from "lucide-react"
import { MAX_IMAGE_BYTES } from "@/lib/images"
import { MAX_FILE_BYTES } from "@/lib/files"
import { readToken } from "@/api/upload-link"
import { getT } from "@/i18n/server"
import { Dropper } from "./dropper"

export const instant = false

// Upload link from an AI app (Claude …) or an API client: the person drops the file here, it lands on the record.
// No sign-in: the signed, short-lived link is the permission (it runs as the connection that asked for it).
export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const t = await getT()
  const p = readToken(token)
  const image = p?.t.kind === "image"
  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-16">
      <header className="grid justify-items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <UploadIcon className="size-6" />
        </span>
        <h1 className="font-heading text-2xl font-semibold">{t(image ? "upload.titleImage" : "upload.titleFile")}</h1>
        {p?.t.label && <p className="text-sm text-muted-foreground">{p.t.label}</p>}
      </header>
      {p ? (
        <Dropper token={token} image={image} maxBytes={image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES} />
      ) : (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">{t("upload.expired")}</p>
      )}
    </main>
  )
}
