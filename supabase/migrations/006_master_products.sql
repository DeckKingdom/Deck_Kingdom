-- Deck Kingdom Ops - master product list (SKUs, stock, costs, kits)
-- Run once in Supabase, AFTER 004_audit.sql (it reuses the stamp/audit triggers).

create table if not exists public.master_products (
  id text primary key,
  sku text not null default '',
  name text not null default '',
  colour text not null default '',
  family text not null default '',      -- groups variations, e.g. "4.8m Decking"
  category text not null default '',
  unit text not null default 'each',
  price_inc_vat numeric,                -- sell price inc VAT (matches invoice lines)
  cost_gbp numeric,                     -- unit cost for job costing (landed cost)
  weight_kg numeric,
  is_kit boolean not null default false,
  stock numeric,                        -- on hand
  stock_alert numeric,                  -- low-stock threshold
  active boolean not null default true,
  notes text not null default '',
  import_product_id text not null default '',  -- optional link to the imports table
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists master_products_sku_idx on public.master_products (sku);

-- kit bill-of-materials: which SKUs (and how many) get loaded for a kit
create table if not exists public.product_components (
  id text primary key,
  kit_id text not null references public.master_products(id) on delete cascade,
  component_id text not null default '',  -- master_products id; kept loose like other line refs
  qty numeric not null default 1,
  position integer not null default 0
);
create index if not exists product_components_kit_idx on public.product_components (kit_id);

alter table public.master_products enable row level security;
alter table public.product_components enable row level security;
drop policy if exists "staff full access" on public.master_products;
create policy "staff full access" on public.master_products
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.product_components;
create policy "staff full access" on public.product_components
  for all to authenticated using (true) with check (true);

-- stamps + audit (functions created by 004_audit.sql)
drop trigger if exists a_dk_stamp on public.master_products;
create trigger a_dk_stamp before insert or update on public.master_products
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.master_products;
create trigger b_dk_audit before insert or update or delete on public.master_products
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.product_components;
create trigger b_dk_audit before insert or update or delete on public.product_components
  for each row execute function public.dk_audit();
