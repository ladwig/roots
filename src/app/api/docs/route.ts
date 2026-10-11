// Interactive API docs (Scalar) for the generated OpenAPI spec. Public: the spec contains no data, only the shape.
export function GET() {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>roots API</title></head>
<body>
<script id="api-reference" data-url="/api/v1/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.70"></script>
</body>
</html>`
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
}
