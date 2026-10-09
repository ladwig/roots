import { dispatch } from "@/api/core"
import { endpoints } from "@/api/v1"

// Public API v1: every method goes through the endpoint list (src/api/v1.ts).
const handle = async (request: Request, { params }: RouteContext<"/api/v1/[...path]">) => dispatch(endpoints, request, "/" + (await params).path.join("/"))
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
