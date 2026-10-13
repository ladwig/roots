import { dispatchPublic } from "@/api/public"

// Public (headless) API: anonymous, per org (src/api/public.ts).
const handle = async (request: Request, { params }: { params: Promise<{ path: string[] }> }) => dispatchPublic(request, "/" + (await params).path.join("/"))
export { handle as GET, handle as POST, handle as OPTIONS }
