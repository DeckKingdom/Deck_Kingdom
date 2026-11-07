-- Deck Kingdom Ops - driver logins and the fuel log (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- A "driver" login opens the phone screen with their own runs and the fuel form - nothing else.
-- The database enforces it: a driver can only read the jobs and supplier pick-ups planned for
-- them (by the driver name on the schedule), the customers/sites those jobs go to, and the vans.
-- They can't change anything except adding their own fuel entries.

-- ===== the driver level =====
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'office', 'warehouse', 'driver', 'none'));
alter table public.profiles add column if not exists driver_name text not null default '';
alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites add constraint staff_invites_role_check check (role in ('admin', 'manager', 'office', 'warehouse', 'driver'));
alter table public.staff_invites add column if not exists driver_name text not null default '';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from public.staff_invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, role, read_only, driver_name)
  values (new.id, new.email, coalesce(inv.full_name, ''), coalesce(inv.role, 'none'), coalesce(inv.read_only, false), coalesce(inv.driver_name, ''))
  on conflict (id) do update set
    role = case when inv.email is not null then inv.role else public.profiles.role end,
    read_only = case when inv.email is not null then inv.read_only else public.profiles.read_only end,
    driver_name = case when inv.email is not null then inv.driver_name else public.profiles.driver_name end,
    full_name = case when coalesce(inv.full_name, '') <> '' then inv.full_name else public.profiles.full_name end;
  return new;
end; $$;

create or replace function public.dk_apply_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = new.role, read_only = new.read_only, driver_name = new.driver_name,
    full_name = case when new.full_name <> '' then new.full_name else full_name end
  where lower(email) = lower(new.email);
  return new;
end; $$;

-- drivers aren't office staff: they don't get the office's reading or editing rights
create or replace function public.dk_is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select public.dk_my_role() not in ('none', 'driver') $$;
create or replace function public.dk_can_edit() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role not in ('none', 'driver') and not read_only) $$;
-- the name this driver goes by on the delivery schedule ('' if not a driver)
create or replace function public.dk_my_driver() returns text language sql stable security definer set search_path = public as
$$ select coalesce((select coalesce(nullif(trim(driver_name), ''), split_part(trim(full_name), ' ', 1)) from public.profiles where id = auth.uid() and role = 'driver'), '') $$;

-- ===== what a driver can read: their own runs =====
do $$ declare t text; begin
  foreach t in array array['invoices', 'invoice_items', 'customers', 'customer_sites', 'collections', 'collection_items', 'vans'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "driver read" on public.%I', t);
    end if;
  end loop;
end $$;
create policy "driver read" on public.invoices for select to authenticated
  using (public.dk_my_driver() <> '' and lower(driver) = lower(public.dk_my_driver()));
create policy "driver read" on public.invoice_items for select to authenticated
  using (public.dk_my_driver() <> '' and exists (select 1 from public.invoices i where i.id = invoice_id and lower(i.driver) = lower(public.dk_my_driver())));
create policy "driver read" on public.customers for select to authenticated
  using (public.dk_my_driver() <> '' and exists (select 1 from public.invoices i where i.customer_id = customers.id and lower(i.driver) = lower(public.dk_my_driver())));
create policy "driver read" on public.customer_sites for select to authenticated
  using (public.dk_my_driver() <> '' and exists (select 1 from public.invoices i where i.site_id = customer_sites.id and lower(i.driver) = lower(public.dk_my_driver())));
create policy "driver read" on public.collections for select to authenticated
  using (public.dk_my_driver() <> '' and lower(driver) = lower(public.dk_my_driver()));
create policy "driver read" on public.collection_items for select to authenticated
  using (public.dk_my_driver() <> '' and exists (select 1 from public.collections c where c.id = collection_id and lower(c.driver) = lower(public.dk_my_driver())));
create policy "driver read" on public.vans for select to authenticated using (public.dk_my_driver() <> '');

-- ===== fuel log =====
create table if not exists public.fuel_logs (
  id text primary key,
  at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  driver text not null default '',
  van text not null default '',
  amount numeric,
  litres numeric,
  points_collected boolean not null default false,
  mileage integer,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  receipt_path text not null default '',
  notes text not null default ''
);
alter table public.fuel_logs enable row level security;
grant select, insert, update, delete on public.fuel_logs to authenticated;
drop policy if exists "driver add" on public.fuel_logs;
drop policy if exists "read fuel" on public.fuel_logs;
drop policy if exists "managers change" on public.fuel_logs;
drop policy if exists "managers remove" on public.fuel_logs;
create policy "driver add" on public.fuel_logs for insert to authenticated
  with check (user_id = auth.uid() and (public.dk_my_driver() <> '' or public.dk_can_edit()));
create policy "read fuel" on public.fuel_logs for select to authenticated
  using (user_id = auth.uid() or public.dk_is_staff());
create policy "managers change" on public.fuel_logs for update to authenticated using (public.dk_can_manage()) with check (public.dk_can_manage());
create policy "managers remove" on public.fuel_logs for delete to authenticated using (public.dk_can_manage());

-- receipt photos: a private bucket; drivers add to their own folder, staff can view
insert into storage.buckets (id, name, public) values ('fuel-receipts', 'fuel-receipts', false) on conflict (id) do nothing;
drop policy if exists "fuel receipts add" on storage.objects;
drop policy if exists "fuel receipts read" on storage.objects;
create policy "fuel receipts add" on storage.objects for insert to authenticated
  with check (bucket_id = 'fuel-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fuel receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'fuel-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.dk_is_staff()));

-- quick check
select email, role, driver_name from public.profiles order by role, email;
