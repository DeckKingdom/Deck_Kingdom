-- Deck Kingdom Ops - suppliers and purchases (the FileMaker "Purchases"
-- layout), with collections linked to the suppliers list.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Nothing destructive: it adds two tables and one column.

create table if not exists public.suppliers (
  id text primary key,
  name text not null default '',
  account_no text not null default '',       -- our account number with them
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  town text not null default '',
  postcode text not null default '',
  website text not null default '',
  category text not null default '',         -- usual purchase category
  payment_method text not null default '',   -- usual way we pay them
  notes text not null default '',
  active boolean not null default true,
  created text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Sub total is ex VAT; vat_amount is null when worked out from vat_rate.
create table if not exists public.purchases (
  id text primary key,
  po_no integer,
  created_at_text text not null default '',
  supplier_id text not null default '',
  physical_receipt boolean not null default false,
  inv_no text not null default '',
  inv_date text not null default '',
  inv_detail text not null default '',
  purchased_by text not null default '',
  category text not null default '',
  vehicle text not null default '',
  sub_total numeric,
  vat_rate numeric not null default 20,
  vat_amount numeric,
  date_paid text not null default '',
  payment_method text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists purchases_supplier_idx on public.purchases (supplier_id);
create index if not exists purchases_po_idx on public.purchases (po_no);

-- collections pick their supplier from the list
alter table public.collections add column if not exists supplier_id text not null default '';

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
drop policy if exists "staff full access" on public.suppliers;
create policy "staff full access" on public.suppliers
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.purchases;
create policy "staff full access" on public.purchases
  for all to authenticated using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['suppliers','purchases'] loop
    execute format('drop trigger if exists a_dk_stamp on public.%I', t);
    execute format('create trigger a_dk_stamp before insert or update on public.%I for each row execute function public.dk_stamp()', t);
    execute format('drop trigger if exists b_dk_audit on public.%I', t);
    execute format('create trigger b_dk_audit before insert or update or delete on public.%I for each row execute function public.dk_audit()', t);
  end loop;
end $$;
