-- Deck Kingdom Ops - numeric SKU fields on the Products (catalogue) table.
-- Each product records its two-digit supplier / length / category /
-- sub-category / product codes; with the colour they make the 12-digit SKU.
-- The lists themselves live in crm_settings (key 'skuLists') once edited in
-- the app. Run once in Supabase. Safe to re-run.

alter table public.products add column if not exists seg_sup  text not null default '';
alter table public.products add column if not exists seg_len  text not null default '';
alter table public.products add column if not exists seg_cat  text not null default '';
alter table public.products add column if not exists seg_sub  text not null default '';
alter table public.products add column if not exists seg_prod text not null default '';
