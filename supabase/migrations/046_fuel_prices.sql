-- Deck Kingdom Ops - daily supermarket fuel prices (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- The fuel-price edge function reads the government Fuel Finder data once a day and keeps the
-- average supermarket (Asda, Tesco, Sainsbury's, Morrisons) diesel price here. Driver tracking
-- uses that day's price to turn each fuel receipt into litres and so into the miles it should cover.

create table if not exists public.fuel_price_days (
  day text primary key,                 -- yyyy-mm-dd
  diesel_ppl numeric,                   -- pence per litre, supermarket average
  petrol_ppl numeric,
  stations integer not null default 0,
  source text not null default '',
  fetched_at timestamptz not null default now()
);
alter table public.fuel_price_days enable row level security;
grant select on public.fuel_price_days to authenticated;
drop policy if exists "staff read fuel prices" on public.fuel_price_days;
create policy "staff read fuel prices" on public.fuel_price_days for select to authenticated using (public.dk_is_staff());
-- written only by the fuel-price edge function (service role)

select * from public.fuel_price_days order by day desc limit 5;
