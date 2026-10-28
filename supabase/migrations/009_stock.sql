-- Deck Kingdom Ops - stock: movements ledger, UK supplier collections,
-- shipment posting flag, actual unit cost on picks.
-- Run once in Supabase, AFTER 006 and 008.

-- a shipment can only be posted into stock once
alter table public.shipments add column if not exists posted_to_stock text not null default '';

-- a pick can carry its actual unit cost (e.g. from a supplier collection)
alter table public.invoice_picks add column if not exists unit_cost numeric;

-- ===== stock movements (the paper trail; stock on hand lives on master_products) =====
create table if not exists public.stock_movements (
  id text primary key,
  at timestamptz not null default now(),
  master_product_id text not null default '',
  sku text not null default '',
  qty numeric not null default 0,          -- + in, - out
  unit_cost numeric,                       -- landed / purchase cost at the time
  kind text not null default '',           -- shipment / collection / adjustment / job
  ref text not null default '',            -- e.g. "Shipment 31", "COL-12", inv #
  actor text not null default '',
  position integer not null default 0
);
create index if not exists stock_movements_sku_idx on public.stock_movements (sku);
create index if not exists stock_movements_at_idx on public.stock_movements (at desc);

-- ===== UK supplier collections =====
create table if not exists public.collections (
  id text primary key,
  collection_no integer,
  supplier text not null default '',
  address text not null default '',
  town text not null default '',
  postcode text not null default '',
  contact text not null default '',
  phone text not null default '',
  date text not null default '',           -- raised
  collect_date text not null default '',
  collect_time text not null default '',
  van text not null default '',
  collected boolean not null default false,
  posted_at text not null default '',      -- committed to stock on this date
  assigned_invoice_id text not null default '',  -- or sent straight to a job
  notes text not null default '',
  raised_by text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  id text primary key,
  collection_id text not null references public.collections(id) on delete cascade,
  sku text not null default '',
  description text not null default '',
  colour text not null default '',
  qty numeric not null default 0,
  unit_cost numeric,
  position integer not null default 0
);
create index if not exists collection_items_collection_idx on public.collection_items (collection_id);

alter table public.stock_movements enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
drop policy if exists "staff full access" on public.stock_movements;
create policy "staff full access" on public.stock_movements
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.collections;
create policy "staff full access" on public.collections
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.collection_items;
create policy "staff full access" on public.collection_items
  for all to authenticated using (true) with check (true);

-- stamps + audit (functions from 004)
drop trigger if exists a_dk_stamp on public.collections;
create trigger a_dk_stamp before insert or update on public.collections
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.collections;
create trigger b_dk_audit before insert or update or delete on public.collections
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.collection_items;
create trigger b_dk_audit before insert or update or delete on public.collection_items
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.stock_movements;
create trigger b_dk_audit before insert or update or delete on public.stock_movements
  for each row execute function public.dk_audit();
