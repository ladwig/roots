// Interactive API docs (Scalar) for the generated OpenAPI specs. Public: the specs contain no data, only the shape.
// /api/docs = key API, /api/docs?api=public = public (headless) API.
export function GET(request: Request) {
  const spec = new URL(request.url).searchParams.get("api") === "public" ? "/api/public/v1/openapi.json" : "/api/v1/openapi.json"
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>roots API</title></head>
<body>
<script id="api-reference" data-url="${spec}"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.70"></script>
</body>
</html>`
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
}
