-- Deck Kingdom Ops - customer discount rate + preferred contact method.
-- Run once in Supabase.

alter table public.customers add column if not exists discount_pct numeric;
alter table public.customers add column if not exists contact_method text not null default '';

-- the customer's rate is copied onto each new invoice (editable per invoice)
alter table public.invoices add column if not exists discount_pct numeric;
