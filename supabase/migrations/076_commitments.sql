-- 076: the fixed-cost register — direct debits, standing orders and finance
-- agreements, with frequency, term and renewal date. Admin eyes only, same as
-- wages. Also: every Gatefield Autos row goes under Fleet / Repairs (Jon).

create table if not exists public.commitments (
  id           text primary key,
  name         text not null default '',   -- what it is ("Unit rent", "FLT finance")
  supplier     text not null default '',
  cost_centre  text not null default '',
  cost_sub     text not null default '',
  amount       numeric not null default 0, -- per payment
  freq         text not null default 'Monthly',  -- Weekly | 4-weekly | Monthly | Quarterly | Annual
  method       text not null default 'DD',       -- DD | SO | Card | Bank
  start_date   text not null default '',
  term_months  int  not null default 0,    -- 0 = rolling / no fixed term
  renewal_date text not null default '',   -- when it renews or the term ends
  notes        text not null default '',
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);

alter table public.commitments enable row level security;
drop policy if exists commitments_admin_all on public.commitments;
create policy commitments_admin_all on public.commitments
  for all to authenticated
  using ((select public.dk_is_admin()))
  with check ((select public.dk_is_admin()));

-- Gatefield Autos -> Fleet / Repairs & maintenance, wherever it landed
update public.purchases p
set cost_centre = 'Fleet', cost_sub = 'Repairs & maintenance'
from public.suppliers s
where s.id = p.supplier_id and s.name ~* 'gatefield'
  and (p.cost_centre is distinct from 'Fleet' or p.cost_sub is distinct from 'Repairs & maintenance');
