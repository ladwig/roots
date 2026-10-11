import { openapi } from "@/api/openapi"
import { endpoints } from "@/api/v1"

export function GET() {
  return Response.json(openapi(endpoints), { headers: { "access-control-allow-origin": "*" } })
}
