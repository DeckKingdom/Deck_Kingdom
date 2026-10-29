-- Deck Kingdom Ops - quotations (quotes + quote lines, linked to customer
-- accounts and convertible into invoices).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Nothing destructive: it only adds two tables and one column.

-- ===== quotes =====
-- Prices are entered inc VAT, same as invoices.
-- customer_id / site_id are plain references (no foreign key) so a draft can
-- be started before the customer is picked.
create table if not exists public.quotes (
  id text primary key,
  quote_no integer,
  customer_id text not null default '',
  site_id text not null default '',
  date text not null default '',
  valid_until text not null default '',
  status text not null default 'Draft',      -- Draft / Sent / Accepted / Declined
  sent_date text not null default '',
  delivery_charge numeric,
  discount_pct numeric,
  vat_rate numeric not null default 20,
  notes text not null default '',            -- printed on the quote
  internal_notes text not null default '',   -- office only
  raised_by text not null default '',
  created text not null default '',
  converted_invoice_id text not null default '',
  converted_at text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists quotes_customer_idx on public.quotes (customer_id);
create index if not exists quotes_quote_no_idx on public.quotes (quote_no);

-- ===== quote lines =====
create table if not exists public.quote_items (
  id text primary key,
  quote_id text not null references public.quotes(id) on delete cascade,
  code text not null default '',
  description text not null default '',
  colour text not null default '',
  qty numeric not null default 0,
  price numeric not null default 0,
  position integer not null default 0
);
create index if not exists quote_items_quote_idx on public.quote_items (quote_id);

-- ===== invoice -> the quote it came from =====
alter table public.invoices add column if not exists quote_id text not null default '';

-- ===== access: logged-in staff =====
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
drop policy if exists "staff full access" on public.quotes;
create policy "staff full access" on public.quotes
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.quote_items;
create policy "staff full access" on public.quote_items
  for all to authenticated using (true) with check (true);

-- ===== who/when stamps + audit trail (functions from 004_audit.sql) =====
drop trigger if exists a_dk_stamp on public.quotes;
create trigger a_dk_stamp before insert or update on public.quotes
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.quotes;
create trigger b_dk_audit before insert or update or delete on public.quotes
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.quote_items;
create trigger b_dk_audit before insert or update or delete on public.quote_items
  for each row execute function public.dk_audit();
