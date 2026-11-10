-- Deck Kingdom Ops - a warehouse login that also drives (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Someone like Ian loads every van and drives his own runs. Give him the Warehouse level and set
-- "Also drives as" in Users & access: his phone then shows Loading for every van plus his own runs
-- on Deliveries, and he can confirm his own drops. Plain driver logins are unchanged (own runs only).

create or replace function public.dk_my_driver() returns text language sql stable security definer set search_path = public as
$$ select coalesce((
     select case when role = 'driver' then coalesce(nullif(trim(driver_name), ''), split_part(trim(full_name), ' ', 1))
                 when role = 'warehouse' then trim(driver_name)
                 else '' end
     from public.profiles where id = auth.uid()), '') $$;

select public.dk_my_driver() as my_driver_name;
