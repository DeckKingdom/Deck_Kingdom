-- Deck Kingdom Ops — a slimmer fast first paint.
-- 061 made the quick load fetch the hot invoices in one round trip but still
-- pulled EVERY customer, site and sample down with it — thousands of rows of
-- FileMaker history nobody needs to paint the screens. Now the same round trip
-- also carries only the people and places attached to live work:
--   * customers: anyone on a hot job, open quote, open collection or hot
--     sample, plus any account created or changed in the last p_days days
--   * sites: the hot customers' sites
--   * samples: anything not sent yet, awaiting a follow-up, or from the last
--     p_days days (the samples screen's 90-day convert stat), with their items
-- The full book still arrives seconds later in the background fill.
-- Needs 061 to have been run once before (this replaces its function).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
create or replace function public.crm_hot_invoices(p_days int default 90)
returns jsonb language sql stable as $$
  with cutoff as (select to_char(current_date - make_interval(days => p_days), 'YYYY-MM-DD') as d),
  hot as (
    select i.* from public.invoices i, cutoff
    where i.delivery_completed = false
       or (coalesce(i.payment_date, '') = '' and not (i.id like 'fm-i-%' and i.date < '2026-01-01'))
       or i.date >= cutoff.d
       or i.delivery_date >= cutoff.d
  ),
  hot_samples as (
    select s.* from public.samples s, cutoff
    where ((coalesce(s.dispatched_date, '') = '' or s.followed_up = false)
            and coalesce(s.outcome, '') = '' and coalesce(s.converted_invoice_id, '') = '')
       or s.date >= cutoff.d
  ),
  hot_customers as (
    select c.* from public.customers c, cutoff
    where c.id in (select customer_id from hot)
       or c.id in (select customer_id from hot_samples)
       or c.id in (select customer_id from public.quotes)
       or c.created >= cutoff.d
       or c.updated_at >= (current_date - make_interval(days => p_days))
  )
  select jsonb_build_object(
    'invoices', coalesce((select jsonb_agg(to_jsonb(h) order by h.position, h.id) from hot h), '[]'::jsonb),
    'items',    coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.invoice_items x where x.invoice_id in (select id from hot)), '[]'::jsonb),
    'picks',    coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.invoice_picks x where x.invoice_id in (select id from hot)), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from hot_customers c), '[]'::jsonb),
    'sites',    coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.customer_sites x where x.customer_id in (select id from hot_customers)), '[]'::jsonb),
    'samples',  coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from hot_samples s), '[]'::jsonb),
    'sampleItems', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.sample_items x where x.sample_id in (select id from hot_samples)), '[]'::jsonb)
  );
$$;
grant execute on function public.crm_hot_invoices(int) to authenticated;

-- how big is the slim slice? (run any time)
select jsonb_object_keys(j) as part, jsonb_array_length(j -> jsonb_object_keys(j)) as rows
from public.crm_hot_invoices(90) j;
