-- Deck Kingdom Ops — second sample follow-up (the discount-code email)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
alter table public.samples add column if not exists followed_up2_date text not null default '';
