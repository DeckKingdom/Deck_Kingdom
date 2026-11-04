-- Deck Kingdom Ops - access levels (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Levels
--   admin      everything, including system settings and who can log in
--   manager    everything except system settings / user access
--   office     customers, invoices, quotes, samples, delivery schedule, collections (no costs or profit)
--   warehouse  same as office for now
--   none       a login nobody has given access to yet: sees nothing
-- "Read only" (any level): can look but not change anything.
--
-- The rules are enforced here in the database, not just hidden in the app.
-- New logins get their level from Users & access in ops (staff_invites below); a login that
-- isn't on that list gets no access at all.

-- ===== who's who =====
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'office', 'warehouse', 'none'));
alter table public.profiles add column if not exists read_only boolean not null default false;
alter table public.profiles alter column role set default 'none';

-- any login made before profiles existed
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;
-- Jon: admin
update public.profiles set role = 'admin', read_only = false where lower(email) = 'fastfireengineer@gmail.com';

-- people given a level before their login exists (matched by email when the login is created)
create table if not exists public.staff_invites (
  email text primary key,
  full_name text not null default '',
  role text not null default 'office' check (role in ('admin', 'manager', 'office', 'warehouse')),
  read_only boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.staff_invites enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from public.staff_invites where email = lower(new.email);
  insert into public.profiles (id, email, full_name, role, read_only)
  values (new.id, new.email, coalesce(inv.full_name, ''), coalesce(inv.role, 'none'), coalesce(inv.read_only, false))
  on conflict (id) do update set
    role = case when inv.email is not null then inv.role else public.profiles.role end,
    read_only = case when inv.email is not null then inv.read_only else public.profiles.read_only end,
    full_name = case when coalesce(inv.full_name, '') <> '' then inv.full_name else public.profiles.full_name end;
  return new;
end; $$;

-- giving an email a level also applies it straight away if that person already has a login
create or replace function public.dk_apply_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = new.role, read_only = new.read_only,
    full_name = case when new.full_name <> '' then new.full_name else full_name end
  where lower(email) = lower(new.email);
  return new;
end; $$;
drop trigger if exists dk_apply_invite on public.staff_invites;
create trigger dk_apply_invite after insert or update on public.staff_invites for each row execute function public.dk_apply_invite();

-- ===== the checks the rules use =====
create or replace function public.dk_my_role() returns text language sql stable security definer set search_path = public as
$$ select coalesce((select role from public.profiles where id = auth.uid()), 'none') $$;
create or replace function public.dk_is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select public.dk_my_role() <> 'none' $$;
create or replace function public.dk_can_edit() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role <> 'none' and not read_only) $$;
create or replace function public.dk_can_manage() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'manager') and not read_only) $$;
create or replace function public.dk_is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- ===== table rules =====
do $$
declare
  t text; p record;
  -- day-to-day records: everyone with access reads, anyone not read-only edits
  daily text[] := array['customers', 'customer_sites', 'invoices', 'invoice_items', 'invoice_picks', 'quotes', 'quote_items',
                        'samples', 'sample_items', 'collections', 'collection_items', 'suppliers', 'master_products',
                        'stock_movements', 'tasks', 'task_log', 'crm_settings'];
  -- costs, imports and fleet: managers and admin only edit
  managed text[] := array['products', 'shipments', 'shipment_lines', 'purchases', 'product_components', 'vans', 'van_checks'];
  -- logs: read only
  logs text[] := array['audit_log', 'email_log', 'fm_links'];
begin
  foreach t in array daily || managed || logs || array['profiles', 'staff_invites'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;

  foreach t in array daily loop
    if to_regclass('public.' || t) is null then continue; end if;
    if t = 'crm_settings' then
      -- the feeds' passwords stay with the admin
      execute 'create policy "staff read" on public.crm_settings for select to authenticated using (public.dk_is_staff() and (key not in (''fmBridge'', ''wooBridge'') or public.dk_is_admin()))';
    else
      execute format('create policy "staff read" on public.%I for select to authenticated using (public.dk_is_staff())', t);
    end if;
    execute format('create policy "staff add" on public.%I for insert to authenticated with check (public.dk_can_edit())', t);
    execute format('create policy "staff change" on public.%I for update to authenticated using (public.dk_can_edit()) with check (public.dk_can_edit())', t);
    execute format('create policy "staff remove" on public.%I for delete to authenticated using (public.dk_can_edit())', t);
  end loop;

  foreach t in array managed loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.dk_is_staff())', t);
    execute format('create policy "managers add" on public.%I for insert to authenticated with check (public.dk_can_manage())', t);
    execute format('create policy "managers change" on public.%I for update to authenticated using (public.dk_can_manage()) with check (public.dk_can_manage())', t);
    execute format('create policy "managers remove" on public.%I for delete to authenticated using (public.dk_can_manage())', t);
  end loop;

  foreach t in array logs loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.dk_is_staff())', t);
  end loop;
end $$;

-- profiles: everyone sees the staff list (and their own row); only the admin changes levels
create policy "staff read" on public.profiles for select to authenticated using (public.dk_is_staff() or id = auth.uid());
create policy "admin change" on public.profiles for update to authenticated using (public.dk_is_admin()) with check (public.dk_is_admin());
create policy "admin remove" on public.profiles for delete to authenticated using (public.dk_is_admin());
-- the admin can't take their own admin away by accident
create or replace function public.dk_keep_an_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (new.role <> 'admin') and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'There must always be at least one admin.';
  end if;
  return new;
end; $$;
drop trigger if exists dk_keep_an_admin on public.profiles;
create trigger dk_keep_an_admin before update on public.profiles for each row execute function public.dk_keep_an_admin();

create policy "admin all" on public.staff_invites for all to authenticated using (public.dk_is_admin()) with check (public.dk_is_admin());

-- quick check: who has which level
select email, role, read_only from public.profiles order by role, email;
