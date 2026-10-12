import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"
import { modules } from "./registry.ts"

// Every org gets every module by default (public.default_module_keys(), newest migration that defines it).
test("default module list in the DB matches the registry", () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url)
  const sql = readdirSync(dir).sort().reverse().map((f) => readFileSync(new URL(f, dir), "utf8")).find((s) => s.includes("function public.default_module_keys()"))
  const keys = [...sql.match(/select array\[([^\]]+)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual([...keys].sort(), modules.map((m) => m.key).sort())
})
