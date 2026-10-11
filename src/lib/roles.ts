import type { T } from "@/i18n/translate"
import { core, modules } from "@/modules/registry"

type RoleLike = { is_owner: boolean; permissions: string[] }

export function roleSummary(t: T, r: RoleLike) {
  if (r.is_owner) return t("roles.summaryOwner")
  if (r.permissions.includes("*")) return t("roles.summaryFull")
  if (!r.permissions.length) return t("roles.summaryViewOnly")
  return t("roles.permissionCount", { count: r.permissions.length })
}

// Permissions a role grants, grouped by module (expands "*" and "module.*").
export function grantedByModule(r: RoleLike) {
  return [core, ...modules]
    .map((m) => ({
      key: m.key,
      permissions: m.permissions.filter(
        (p) => r.is_owner || r.permissions.includes("*") || r.permissions.includes(p) || r.permissions.includes(`${m.key}.*`)
      ),
    }))
    .filter((g) => g.permissions.length)
}
