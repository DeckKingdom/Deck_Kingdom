-- Deck Kingdom Ops - sample requests (linked to customer accounts, with the
-- invoice each request converted into, for conversion reporting).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Nothing destructive: it only adds two tables.

create table if not exists public.samples (
  id text primary key,
  sample_no integer,
  customer_id text not null default '',
  date text not null default '',
  source text not null default '',
  dispatch_method text not null default '',
  dispatched_date text not null default '',
  tracking_ref text not null default '',
  follow_up_date text not null default '',
  followed_up boolean not null default false,
  followed_up_date text not null default '',
  project text not null default '',          -- what they're planning (size, timescale)
  notes text not null default '',
  outcome text not null default '',          -- '' or 'lost'
  lost_reason text not null default '',
  converted_invoice_id text not null default '',
  converted_at text not null default '',
  link_manual boolean not null default false,
  raised_by text not null default '',
  created text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists samples_customer_idx on public.samples (customer_id);
create index if not exists samples_date_idx on public.samples (date);

create table if not exists public.sample_items (
  id text primary key,
  sample_id text not null references public.samples(id) on delete cascade,
  description text not null default '',
  colour text not null default '',
  size text not null default 'Free',
  qty numeric not null default 1,
  position integer not null default 0
);
create index if not exists sample_items_sample_idx on public.sample_items (sample_id);

alter table public.samples enable row level security;
alter table public.sample_items enable row level security;
drop policy if exists "staff full access" on public.samples;
create policy "staff full access" on public.samples
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.sample_items;
create policy "staff full access" on public.sample_items
  for all to authenticated using (true) with check (true);

drop trigger if exists a_dk_stamp on public.samples;
create trigger a_dk_stamp before insert or update on public.samples
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.samples;
create trigger b_dk_audit before insert or update or delete on public.samples
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.sample_items;
create trigger b_dk_audit before insert or update or delete on public.sample_items
  for each row execute function public.dk_audit();
