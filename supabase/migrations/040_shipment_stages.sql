-- Deck Kingdom Ops - shipment stage dates (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- A date for each stage (filled in automatically when the status moves to that stage),
-- and the expected balance date when it's typed in by hand.
alter table public.shipments add column if not exists confirmed_date  text not null default '';
alter table public.shipments add column if not exists production_date text not null default '';
alter table public.shipments add column if not exists shipped_date    text not null default '';
alter table public.shipments add column if not exists balance_due     text not null default '';
