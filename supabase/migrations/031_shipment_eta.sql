-- Deck Kingdom Ops — expected arrival date on import shipments
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
alter table public.shipments add column if not exists eta_date text not null default '';
