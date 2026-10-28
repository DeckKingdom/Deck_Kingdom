-- Deck Kingdom Ops - CRM module (customers, sites, invoices, delivery schedule)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

-- ===== customers =====
create table if not exists public.customers (
  id text primary key,
  account_no integer,
  name text not null default '',
  address text not null default '',
  town text not null default '',
  postcode text not null default '',
  contact text not null default '',
  landline text not null default '',
  mobile text not null default '',
  email text not null default '',
  source text not null default '',
  trader boolean not null default false,
  created text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists customers_account_no_idx on public.customers (account_no);

-- ===== customer sites =====
create table if not exists public.customer_sites (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  site_no integer,
  name text not null default '',
  address text not null default '',
  town text not null default '',
  postcode text not null default '',
  contact text not null default '',
  landline text not null default '',
  mobile text not null default '',
  email text not null default '',
  notes text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists customer_sites_customer_idx on public.customer_sites (customer_id);

-- ===== invoices =====
-- Line prices are entered inc VAT (vat_rate backs the VAT out of the total).
-- site_id is NOT a foreign key: a site can be removed while old invoices keep the reference.
create table if not exists public.invoices (
  id text primary key,
  inv_no integer,
  customer_id text not null references public.customers(id) on delete restrict,
  site_id text not null default '',
  date text not null default '',
  order_ref text not null default '',
  job_type text not null default 'Delivery 1',
  van text not null default '',
  weight_kg numeric,
  delivery_date text not null default '',
  delivery_time text not null default '',
  delivery_completed boolean not null default false,
  payment_type text not null default '',
  payment_date text not null default '',
  delivery_charge numeric,
  vat_rate numeric not null default 20,
  vat_inclusive boolean not null default true,
  job_notes text not null default '',
  raised_by text not null default '',
  created text not null default '',
  -- prep workflow
  f_booked boolean not null default false,
  f_courier boolean not null default false,
  f_parts_ordered boolean not null default false,
  f_parts_ready boolean not null default false,
  f_payment_link boolean not null default false,
  -- follow-up workflow
  f_review_requested boolean not null default false,
  f_review_received boolean not null default false,
  f_photos_requested boolean not null default false,
  f_social_posted boolean not null default false,
  f_sample_followed boolean not null default false,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_delivery_date_idx on public.invoices (delivery_date);
create index if not exists invoices_inv_no_idx on public.invoices (inv_no);

-- ===== invoice items =====
create table if not exists public.invoice_items (
  id text primary key,
  invoice_id text not null references public.invoices(id) on delete cascade,
  code text not null default '',
  description text not null default '',
  colour text not null default '',
  qty numeric not null default 0,
  price numeric not null default 0,  -- inc VAT
  position integer not null default 0
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

-- ===== CRM settings (next auto-numbers etc, one jsonb value per key) =====
create table if not exists public.crm_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ===== access rules (v1: any signed-in member of staff, full access) =====
alter table public.customers enable row level security;
alter table public.customer_sites enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.crm_settings enable row level security;

create policy "staff full access" on public.customers
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.customer_sites
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.invoices
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.invoice_items
  for all to authenticated using (true) with check (true);
create policy "staff full access" on public.crm_settings
  for all to authenticated using (true) with check (true);
