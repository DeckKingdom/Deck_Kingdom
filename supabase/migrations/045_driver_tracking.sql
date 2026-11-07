-- Deck Kingdom Ops - driver tracking: when each run sets off (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Needs drop-confirmations.sql run first.
--
-- After the load check the driver taps "Set off" - the time and where they were are recorded here.
-- With the drop confirmations (time + location of every drop) the Driver tracking screen works out
-- miles, hours and the cost of each drop, and flags anything that doesn't add up.

create table if not exists public.driver_events (
  id text primary key,
  at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  driver text not null default '',
  run_date text not null default '',
  run_no text not null default '',
  van text not null default '',
  kind text not null default 'depart',  -- depart | back
  lat double precision,
  lng double precision,
  accuracy_m double precision
);
create index if not exists driver_events_date on public.driver_events (run_date);
alter table public.driver_events enable row level security;
grant select, insert, update, delete on public.driver_events to authenticated;

drop policy if exists "driver logs" on public.driver_events;
drop policy if exists "read driver events" on public.driver_events;
drop policy if exists "managers change driver events" on public.driver_events;
drop policy if exists "managers remove driver events" on public.driver_events;
create policy "driver logs" on public.driver_events for insert to authenticated
  with check (user_id = auth.uid() and (public.dk_my_driver() <> '' or public.dk_can_edit()));
create policy "read driver events" on public.driver_events for select to authenticated
  using (public.dk_is_staff() or user_id = auth.uid());
create policy "managers change driver events" on public.driver_events for update to authenticated using (public.dk_can_manage()) with check (public.dk_can_manage());
create policy "managers remove driver events" on public.driver_events for delete to authenticated using (public.dk_can_manage());

select count(*) as driver_events from public.driver_events;
