-- Deck Kingdom Ops — supplier collections ride the delivery runs
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
-- Gives each supplier collection a driver, run number and drop/stop number, so a
-- pick-up can sit inside a driver's run on the Delivery Schedule.
alter table public.collections add column if not exists driver  text not null default '';
alter table public.collections add column if not exists run_no  text not null default '';
alter table public.collections add column if not exists drop_no text not null default '';
