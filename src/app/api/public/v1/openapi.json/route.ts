import { openapi, PUBLIC_INFO } from "@/api/openapi"
import { publicEndpoints } from "@/api/public"

export function GET() {
  return Response.json(openapi(publicEndpoints, PUBLIC_INFO), { headers: { "access-control-allow-origin": "*" } })
}
