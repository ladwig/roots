-- One live ticket per guest entry. Concurrent link submissions could issue two tickets for the same entry
-- (the orphan stayed valid). The ticket now names its entry; a partial unique index makes a second live one impossible.
-- Void tickets don't count, so "remove = void" and re-issuing after a void keep working.
alter table public.tickets add column guest_entry_id uuid references public.guest_entries on delete set null;

-- Existing data: void orphan duplicates (same entry via order metadata, not the one the entry points to) ...
update public.tickets t set status = 'void'
from public.pay_orders o, public.guest_entries e
where o.id = t.order_id and o.source_module = 'guestlists'
  and e.id = (o.metadata ->> 'guest_entry')::uuid
  and t.id is distinct from e.ticket_id and t.status in ('valid', 'reserved');

-- ... then link the surviving ticket to its entry.
update public.tickets t set guest_entry_id = e.id
from public.guest_entries e
where e.ticket_id = t.id and t.status <> 'void';

create unique index tickets_guest_entry_live on public.tickets (guest_entry_id)
  where guest_entry_id is not null and status <> 'void';
