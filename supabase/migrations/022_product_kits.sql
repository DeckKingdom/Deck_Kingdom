-- Deck Kingdom Ops - kit recipes on the Products (catalogue) table.
-- is_kit marks a product as a kit; kit holds its parts as
-- [{ "productId": "...", "qty": 4, "colour": "" }] — blank colour = same as the kit.
-- The stock rows' parts (product_components) are generated from this by the app.
-- Run once in Supabase. Safe to re-run.

alter table public.products add column if not exists is_kit boolean not null default false;
alter table public.products add column if not exists kit jsonb not null default '[]'::jsonb;
