-- Deck Kingdom Ops - vans module (fleet details, insurance, weekly checks)
-- Run once in Supabase, AFTER 004_audit.sql.

create table if not exists public.vans (
  id text primary key,
  name text not null default '',
  reg text not null default '',
  make_model text not null default '',
  insurer text not null default '',
  policy_no text not null default '',
  insurance_renewal text not null default '',
  mot_due text not null default '',
  tax_due text not null default '',
  service_due text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.van_checks (
  id text primary key,
  van_id text not null references public.vans(id) on delete cascade,
  date text not null default '',
  by_who text not null default '',
  mileage numeric,
  tyres boolean not null default true,
  lights boolean not null default true,
  oil boolean not null default true,
  coolant boolean not null default true,
  brakes boolean not null default true,
  bodywork boolean not null default true,
  load_area boolean not null default true,
  defects text not null default '',
  position integer not null default 0
);
create index if not exists van_checks_van_idx on public.van_checks (van_id);

alter table public.vans enable row level security;
alter table public.van_checks enable row level security;
drop policy if exists "staff full access" on public.vans;
create policy "staff full access" on public.vans
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.van_checks;
create policy "staff full access" on public.van_checks
  for all to authenticated using (true) with check (true);

drop trigger if exists a_dk_stamp on public.vans;
create trigger a_dk_stamp before insert or update on public.vans
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.vans;
create trigger b_dk_audit before insert or update or delete on public.vans
  for each row execute function public.dk_audit();
drop trigger if exists b_dk_audit on public.van_checks;
create trigger b_dk_audit before insert or update or delete on public.van_checks
  for each row execute function public.dk_audit();

-- the three vans, ready to fill in
insert into public.vans (id, name, position) values
  ('van-vauxhall', 'Vauxhall', 1),
  ('van-renault', 'Renault', 2),
  ('van-sprinter', 'Sprinter', 3)
on conflict (id) do nothing;
