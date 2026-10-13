import { z } from "zod"
import { deliverSoon } from "@/events/worker"
import { readCourse, readSeries, readSession } from "@/courses/fields"
import { ApiError, dbError, endpoint, list, notFound, page, paged, uuid, type Endpoint } from "../core"
import { ts, type Db } from "./shared"

// Courses: dates, participants (contacts) with waiting list, attendance. Validation = the App's (src/courses/fields.ts);
// places and moving up from the waiting list happen in the database.
const TAG = "Courses"
const Course = z.object({
  id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  instructor: z.string().nullable(),
  location_id: uuid.nullable(),
  capacity: z.number().int().nullable().describe("null = unlimited"),
  track_attendance: z.boolean(),
  enrolled: z.number().int(),
  waiting: z.number().int(),
  created_at: ts,
  updated_at: ts,
})
const COURSE_COLS = "id, title, description, instructor, location_id, capacity, track_attendance, created_at, updated_at, course_participants(status)"
const CourseInput = z
  .object({ title: z.string().max(200), description: z.string().max(5000).nullable(), instructor: z.string().max(200).nullable(), location_id: uuid.nullable(), capacity: z.number().int().min(1).max(10000).nullable(), track_attendance: z.boolean() })
  .partial()
  .strict()
const Session = z.object({ id: uuid, course_id: uuid, starts_at: ts, ends_at: ts, cancelled: z.boolean(), note: z.string().nullable() })
const SESSION_COLS = "id, course_id, starts_at, ends_at, cancelled, note"
const Participant = z.object({
  id: uuid,
  course_id: uuid,
  contact_id: uuid,
  status: z.enum(["enrolled", "waiting", "cancelled"]).describe("waiting = course full; moves up automatically when a place frees up"),
  note: z.string().nullable(),
  created_at: ts,
})
const PART_COLS = "id, course_id, contact_id, status, note, created_at"

type CourseRow = { course_participants: { status: string }[] } & Record<string, unknown>
const courseOut = ({ course_participants, ...c }: CourseRow) => ({
  ...c,
  enrolled: course_participants.filter((p) => p.status === "enrolled").length,
  waiting: course_participants.filter((p) => p.status === "waiting").length,
})
const getter = (o: Record<string, unknown>) => (k: string) => {
  const v = o[k]
  return v == null ? "" : typeof v === "boolean" ? (v ? "1" : "") : String(v)
}
const invalid = (key: string) => new ApiError(422, key.split(".").pop()!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), key)
async function courseOf(db: Db, orgId: string, id: string) {
  const { data } = await db.from("courses").select(COURSE_COLS).eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
  if (!data) throw notFound()
  return courseOut(data)
}
async function locationOk(db: Db, orgId: string, id: string | null | undefined) {
  if (!id) return
  const { data } = await db.from("locations").select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (!data) throw new ApiError(422, "invalid_reference", "location_id does not belong to this organisation.")
}

export const endpoints: Endpoint[] = [
  endpoint({
    method: "GET",
    path: "/courses",
    permission: "courses.view",
    tag: TAG,
    summary: "List courses",
    query: page.extend({ q: z.string().max(100).optional() }),
    response: list(Course),
    async handler({ db, orgId, query }) {
      let q = db.from("courses").select(COURSE_COLS).eq("org_id", orgId).is("deleted_at", null).order("title").range(query.offset, query.offset + query.limit)
      const s = query.q?.replace(/[%,()*]/g, "").trim()
      if (s) q = q.or(`title.ilike.%${s}%,instructor.ilike.%${s}%`)
      const { data } = await q
      return paged((data ?? []).map(courseOut), query)
    },
  }),
  endpoint({
    method: "GET",
    path: "/courses/{id}",
    permission: "courses.view",
    tag: TAG,
    summary: "Get a course",
    response: Course,
    async handler({ db, orgId, params }) {
      return courseOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "POST",
    path: "/courses",
    permission: "courses.manage",
    tag: TAG,
    summary: "Create a course",
    body: CourseInput.required({ title: true }),
    response: Course,
    status: 201,
    async handler({ db, orgId, body }) {
      const r = readCourse(getter({ track_attendance: true, ...body }))
      if ("error" in r) throw invalid(r.error)
      await locationOk(db, orgId, r.row.location_id)
      const { data, error } = await db.from("courses").insert({ ...r.row, org_id: orgId }).select("id").single()
      if (error) throw dbError(error)
      return courseOf(db, orgId, data.id)
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/courses/{id}",
    permission: "courses.manage",
    tag: TAG,
    summary: "Change a course",
    description: "More places move people up from the waiting list.",
    body: CourseInput,
    response: Course,
    async handler({ db, orgId, params, body }) {
      const old = await courseOf(db, orgId, params.id)
      const r = readCourse(getter({ ...old, ...body }))
      if ("error" in r) throw invalid(r.error)
      await locationOk(db, orgId, r.row.location_id)
      const { error } = await db.from("courses").update(r.row).eq("id", params.id).eq("org_id", orgId)
      if (error) throw dbError(error)
      deliverSoon()
      return courseOf(db, orgId, params.id)
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/courses/{id}",
    permission: "courses.manage",
    tag: TAG,
    summary: "Move a course to the trash",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      await courseOf(db, orgId, params.id)
      const { error } = await db.rpc("soft_delete", { p_table: "public.courses", p_id: params.id })
      if (error) throw dbError(error)
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/courses/{id}/sessions",
    permission: "courses.view",
    tag: TAG,
    summary: "Dates of a course",
    response: z.object({ data: z.array(Session) }),
    async handler({ db, orgId, params }) {
      await courseOf(db, orgId, params.id)
      const { data } = await db.from("course_sessions").select(SESSION_COLS).eq("course_id", params.id).eq("org_id", orgId).order("starts_at")
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/courses/{id}/sessions",
    permission: "courses.manage",
    tag: TAG,
    summary: "Add dates",
    description: "Either one date (`starts_at` + `ends_at`, ISO) or a weekly series (`weekdays` 1 = Mon … 7 = Sun, `from`/`to` dates, `start_time`/`end_time` HH:MM Berlin time, `every_weeks`). Dates at an existing start are skipped.",
    body: z
      .object({
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
        weekdays: z.array(z.number().int().min(1).max(7)).max(7),
        from: z.string().max(10),
        to: z.string().max(10),
        start_time: z.string().max(5),
        end_time: z.string().max(5),
        every_weeks: z.number().int().min(1).max(8),
      })
      .partial()
      .strict(),
    response: z.object({ data: z.array(Session) }),
    status: 201,
    async handler({ db, orgId, params, body }) {
      await courseOf(db, orgId, params.id)
      const r = body.weekdays ? readSeries(getter(body), body.weekdays.map(String)) : readSession(getter(body))
      if ("error" in r) throw invalid(r.error)
      const rows = "dates" in r.row ? r.row.dates : [r.row]
      const { data, error } = await db
        .from("course_sessions")
        .upsert(rows.map((s) => ({ ...s, org_id: orgId, course_id: params.id })), { onConflict: "course_id,starts_at", ignoreDuplicates: true })
        .select(SESSION_COLS)
      if (error) throw dbError(error)
      return { data }
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/course-sessions/{id}",
    permission: "courses.manage",
    tag: TAG,
    summary: "Change, move or cancel a date",
    body: z.object({ starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }), cancelled: z.boolean(), note: z.string().max(500).nullable() }).partial().strict(),
    response: Session,
    async handler({ db, orgId, params, body }) {
      const { data: old } = await db.from("course_sessions").select(SESSION_COLS).eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!old) throw notFound()
      const r = readSession(getter({ ...old, ...body }))
      if ("error" in r) throw invalid(r.error)
      const { data, error } = await db.from("course_sessions").update(r.row).eq("id", params.id).eq("org_id", orgId).select(SESSION_COLS).single()
      if (error) throw error.code === "23505" ? new ApiError(409, "date_taken", "The course already has a date at this time.") : dbError(error)
      return data
    },
  }),
  endpoint({
    method: "DELETE",
    path: "/course-sessions/{id}",
    permission: "courses.manage",
    tag: TAG,
    summary: "Delete a date (and its attendance)",
    response: z.object({ ok: z.literal(true) }),
    async handler({ db, orgId, params }) {
      const { data, error } = await db.from("course_sessions").delete().eq("id", params.id).eq("org_id", orgId).select("id")
      if (error) throw dbError(error)
      if (!data.length) throw notFound()
      return { ok: true }
    },
  }),
  endpoint({
    method: "GET",
    path: "/courses/{id}/participants",
    permission: "courses.view",
    tag: TAG,
    summary: "Participants and waiting list",
    description: "In waiting order (oldest first).",
    query: z.object({ status: z.enum(["enrolled", "waiting", "cancelled"]).optional() }),
    response: z.object({ data: z.array(Participant) }),
    async handler({ db, orgId, params, query }) {
      await courseOf(db, orgId, params.id)
      let q = db.from("course_participants").select(PART_COLS).eq("course_id", params.id).eq("org_id", orgId).order("created_at")
      if (query.status) q = q.eq("status", query.status)
      const { data } = await q
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "POST",
    path: "/courses/{id}/participants",
    permission: "courses.manage",
    tag: TAG,
    summary: "Add a contact to a course",
    description: "Gets `status: waiting` when the course is full. Someone who cancelled is enrolled again (new place in the waiting order).",
    body: z.object({ contact_id: uuid, note: z.string().max(500).optional() }).strict(),
    response: Participant,
    status: 201,
    async handler({ db, orgId, params, body }) {
      await courseOf(db, orgId, params.id)
      const { data: contact } = await db.from("contacts").select("id").eq("id", body.contact_id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      if (!contact) throw new ApiError(422, "invalid_reference", "contact_id does not belong to this organisation.")
      await db.from("course_participants").delete().eq("course_id", params.id).eq("contact_id", body.contact_id).eq("status", "cancelled").eq("org_id", orgId)
      const { data, error } = await db.from("course_participants").insert({ org_id: orgId, course_id: params.id, contact_id: body.contact_id, note: body.note?.trim() || null }).select(PART_COLS).single()
      if (error) throw error.code === "23505" ? new ApiError(409, "already_in", "This contact is already in the course.") : dbError(error)
      deliverSoon()
      return data
    },
  }),
  endpoint({
    method: "PATCH",
    path: "/course-participants/{id}",
    permission: "courses.manage",
    tag: TAG,
    summary: "Cancel or re-enrol a participant",
    description: "`cancelled` frees the place (the next on the waiting list moves up); `enrolled` takes a place again or waits.",
    body: z.object({ status: z.enum(["enrolled", "cancelled"]).optional(), note: z.string().max(500).nullable().optional() }).strict(),
    response: Participant,
    async handler({ db, orgId, params, body }) {
      const { data, error } = await db.from("course_participants").update(body).eq("id", params.id).eq("org_id", orgId).select(PART_COLS).maybeSingle()
      if (error) throw dbError(error)
      if (!data) throw notFound()
      deliverSoon()
      return data
    },
  }),
  endpoint({
    method: "GET",
    path: "/course-sessions/{id}/attendance",
    permission: "courses.view",
    tag: TAG,
    summary: "Attendance of a date",
    response: z.object({ data: z.array(z.object({ participant_id: uuid, present: z.boolean() })) }),
    async handler({ db, orgId, params }) {
      const { data } = await db.from("course_attendance").select("participant_id, present").eq("session_id", params.id).eq("org_id", orgId)
      return { data: data ?? [] }
    },
  }),
  endpoint({
    method: "PUT",
    path: "/course-sessions/{id}/attendance",
    permission: "courses.manage",
    tag: TAG,
    summary: "Set attendance of a date",
    description: "Only the given participants are changed.",
    body: z.object({ data: z.array(z.object({ participant_id: uuid, present: z.boolean() }).strict()).min(1).max(1000) }).strict(),
    response: z.object({ updated: z.number().int() }),
    async handler({ db, orgId, params, body }) {
      const { data: session } = await db.from("course_sessions").select("course_id").eq("id", params.id).eq("org_id", orgId).maybeSingle()
      if (!session) throw notFound()
      const ids = body.data.map((a) => a.participant_id)
      const { data: valid } = await db.from("course_participants").select("id").eq("course_id", session.course_id).eq("org_id", orgId).in("id", ids)
      if ((valid?.length ?? 0) !== new Set(ids).size) throw new ApiError(422, "invalid_reference", "Every participant_id must be a participant of this course.")
      const { error } = await db.from("course_attendance").upsert(body.data.map((a) => ({ ...a, org_id: orgId, session_id: params.id })), { onConflict: "session_id,participant_id" })
      if (error) throw dbError(error)
      return { updated: body.data.length }
    },
  }),
]
