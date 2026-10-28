-- Deck Kingdom Ops - loading bill picks (which batch/shipment stock came from)
-- Run once in Supabase, AFTER 004_audit.sql.

create table if not exists public.invoice_picks (
  id text primary key,
  invoice_id text not null references public.invoices(id) on delete cascade,
  sku text not null default '',
  description text not null default '',
  colour text not null default '',
  qty numeric not null default 0,
  shipment_id text not null default '',  -- which import shipment the stock came from
  batch_ref text not null default '',    -- free-text batch ref for non-import stock
  picked boolean not null default false,
  position integer not null default 0
);
create index if not exists invoice_picks_invoice_idx on public.invoice_picks (invoice_id);

alter table public.invoice_picks enable row level security;
drop policy if exists "staff full access" on public.invoice_picks;
create policy "staff full access" on public.invoice_picks
  for all to authenticated using (true) with check (true);

drop trigger if exists b_dk_audit on public.invoice_picks;
create trigger b_dk_audit before insert or update or delete on public.invoice_picks
  for each row execute function public.dk_audit();
