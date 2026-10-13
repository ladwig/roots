// Shared schemas + helpers for the v1 endpoint files.
import { z } from "zod"
import { ApiError, type Endpoint } from "../core"

export const ts = z.string().describe("ISO 8601 timestamp")
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD")
export const Custom = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe("Custom fields of the org: { key: value }")
export const berlinToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
export type Db = Parameters<Endpoint["handler"]>[0]["db"]
export const dbFail = () => new ApiError(500, "internal", "Database error.")
