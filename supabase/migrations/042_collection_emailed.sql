-- Deck Kingdom Ops - remember when a collection note was emailed to the supplier
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
alter table public.collections add column if not exists emailed_at text not null default '';
