-- Deck Kingdom Ops - batch tracking support
-- Marking a delivery completed now deducts stock (once); this records when.
alter table public.invoices add column if not exists stock_deducted text not null default '';
