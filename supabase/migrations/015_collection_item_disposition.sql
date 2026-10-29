-- Deck Kingdom Ops - per-line collection disposition
-- Each collection item is committed to stock or assigned to a job on its own.
alter table public.collection_items add column if not exists assigned_invoice_id text not null default '';
alter table public.collection_items add column if not exists posted_at text not null default '';
