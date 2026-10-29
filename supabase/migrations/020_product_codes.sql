-- Deck Kingdom Ops - product codes (SOURCE / SIZE / TYPE, e.g. DK/3.6/DECK) and
-- a UK £ cost for bought-in products, on the Products (catalogue) table.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

alter table public.products add column if not exists code text not null default '';
alter table public.products add column if not exists cost_gbp numeric;
create index if not exists products_code_idx on public.products (code);
