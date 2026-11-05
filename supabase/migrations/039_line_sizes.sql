-- Deck Kingdom Ops - length x width on lines (artificial grass sold by the square metre)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- A grass line can carry the roll length and width it was cut to; the qty is their product (m2).
alter table public.invoice_items    add column if not exists len_m   numeric;
alter table public.invoice_items    add column if not exists width_m numeric;
alter table public.quote_items      add column if not exists len_m   numeric;
alter table public.quote_items      add column if not exists width_m numeric;
alter table public.collection_items add column if not exists len_m   numeric;
alter table public.collection_items add column if not exists width_m numeric;
