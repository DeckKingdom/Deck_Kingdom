-- Deck Kingdom Ops — review ask cadence
-- When the review ask went out and when the single follow-up nudge went out,
-- so the Reviews screen can surface "nudge due" after 7 days and stop after one.
alter table public.invoices add column if not exists review_asked_at text not null default '';
alter table public.invoices add column if not exists review_nudged_at text not null default '';
