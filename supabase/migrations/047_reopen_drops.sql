-- Deck Kingdom Ops - reopen a driver's drop / reset a run (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Needs drop-confirmations.sql and driver-tracking.sql run first.
--
-- Reopening keeps the driver's confirmation (photo, times) on record but marks it void, so the job
-- opens again on the driver's phone and drops out of tracking. Resetting a run also voids the
-- set-off and makes the driver's phone forget the load-check ticks for that run.

alter table public.drop_confirmations add column if not exists voided_at text not null default '';
alter table public.drop_confirmations add column if not exists voided_by text not null default '';
alter table public.driver_events add column if not exists voided_at text not null default '';

-- office staff can void a set-off (managers already could change anything)
drop policy if exists "office voids driver events" on public.driver_events;
create policy "office voids driver events" on public.driver_events for update to authenticated
  using (public.dk_can_edit()) with check (public.dk_can_edit());

-- drivers can see events for their runs that the office logged (a reset), not just their own
drop policy if exists "read driver events" on public.driver_events;
create policy "read driver events" on public.driver_events for select to authenticated
  using (public.dk_is_staff() or user_id = auth.uid()
    or (public.dk_my_driver() <> '' and lower(driver) = lower(public.dk_my_driver())));

select count(*) filter (where voided_at <> '') as voided, count(*) as confirmations from public.drop_confirmations;
