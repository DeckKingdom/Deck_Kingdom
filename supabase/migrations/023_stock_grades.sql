-- Deck Kingdom Ops — stock grades (damaged / returned / clearance).
-- Each grade is its own stock row beside the good one (SKU with -D / -R / -C), so it
-- can be sold on an invoice line, picked and costed. Safe to re-run.
alter table public.master_products add column if not exists grade text not null default '';
create index if not exists master_products_grade_idx on public.master_products (grade) where grade <> '';
