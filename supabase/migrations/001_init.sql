-- Deck Kingdom Ops - initial schema
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- ===== staff profiles (one row per login, created automatically) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'office' check (role in ('admin','office','warehouse')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "staff can read profiles" on public.profiles
  for select to authenticated using (true);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ===== products =====
create table if not exists public.products (
  id text primary key,
  name text not null default '',
  colours jsonb not null default '[]'::jsonb,
  qty numeric not null default 0,
  cost numeric not null default 0,
  weight numeric not null default 0,
  cbm numeric not null default 0,
  supplier text not null default '',
  category text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ===== shipments =====
create table if not exists public.shipments (
  id text primary key,
  name text not null default '',
  status text not null default 'Planning',
  supplier text not null default '',
  created text not null default '',
  order_date text not null default '',
  deposit_date text not null default '',
  arrived_date text not null default '',
  balance_paid_date text not null default '',
  invoice_no text not null default '',
  surcharge_on boolean not null default true,
  duty_on boolean not null default true,
  duty_gbp numeric,
  shipping_gbp numeric,
  deposit_usd numeric,
  deposit_fx numeric,
  balance_usd numeric,
  balance_fx numeric,
  value_usd numeric,
  fx_rate numeric,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ===== shipment lines =====
-- product_id is intentionally NOT a foreign key: the app allows removing a
-- product while historical lines keep referring to it.
create table if not exists public.shipment_lines (
  id text primary key,
  shipment_id text not null references public.shipments(id) on delete cascade,
  product_id text not null default '',
  colour text not null default '',
  pallets numeric not null default 0,
  qty numeric not null default 0,
  cost numeric not null default 0,
  weight numeric not null default 0,
  position integer not null default 0
);
create index if not exists shipment_lines_shipment_idx on public.shipment_lines (shipment_id);

-- ===== access rules (v1: any signed-in member of staff, full access) =====
-- The role column on profiles is ready for finer-grained rules
-- (e.g. warehouse cannot see costs) once the access grid is decided.
alter table public.products enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;

create policy "staff full access" on public.products
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.shipments
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.shipment_lines
  for all to authenticated using (true) with check (true);
