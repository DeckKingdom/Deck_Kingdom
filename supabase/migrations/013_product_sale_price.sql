-- Deck Kingdom Ops - sale price on the products table
-- (the Products screen now carries the retail £/pc inc VAT; the background
-- stock rows pick it up automatically). Run once in Supabase.

alter table public.products add column if not exists sale_price numeric;
