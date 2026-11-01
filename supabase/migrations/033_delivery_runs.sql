-- Deck Kingdom Ops — driver and drop number on jobs (delivery schedule)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
alter table public.invoices add column if not exists driver  text not null default '';
alter table public.invoices add column if not exists drop_no text not null default '';
