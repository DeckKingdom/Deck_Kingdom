-- Deck Kingdom Ops - "Served by" and "Source" on each job (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Served by: who served the customer (Molly, Ian, Mands, Jon, Hayley).
-- Source: where the customer found us - shows the account's source until changed on the job.
alter table public.invoices add column if not exists served_by text not null default '';
alter table public.invoices add column if not exists source text not null default '';
select count(*) as jobs from public.invoices;
