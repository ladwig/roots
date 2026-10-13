// Hub events an automation can react to: the payload names a contact (contact_id) or an email address.
// `vars` = extra placeholders the event brings (besides {first_name}, {last_name}, {name}, {email}, {org}).
export const AUTOMATION_EVENTS: { type: string; module: string; vars: string[] }[] = [
  { type: "contact.created", module: "crm", vars: [] },
  { type: "membership.started", module: "members", vars: ["number", "starts_at"] },
  { type: "membership.ended", module: "members", vars: ["number", "ends_on"] },
  { type: "form.submitted", module: "forms", vars: ["form"] },
  { type: "course.enrolled", module: "courses", vars: ["title"] },
  { type: "course.moved_up", module: "courses", vars: ["title"] },
]
