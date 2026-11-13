-- Deck Kingdom Ops — one-trip login.
-- 063 slimmed WHAT the quick load carries; this folds in the rest of what the
-- first paint needs — products, components, collections, vans and checks,
-- suppliers, purchases, quotes, tasks, settings, staff — so logging in makes
-- ONE data request instead of ~14, and the round-trip overhead is paid once.
-- Stock movements and the task log still arrive with the background fill.
-- Replaces the same function; run any time, safe to re-run.
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
    'sampleItems', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.sample_items x where x.sample_id in (select id from hot_samples)), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.master_products x), '[]'::jsonb),
    'components', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.product_components x), '[]'::jsonb),
    'collections', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.collections x), '[]'::jsonb),
    'collectionItems', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.collection_items x), '[]'::jsonb),
    'vans', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.vans x), '[]'::jsonb),
    'vanChecks', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.van_checks x), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.suppliers x), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.purchases x), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.quotes x), '[]'::jsonb),
    'quoteItems', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.quote_items x), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.tasks x), '[]'::jsonb),
    'settings', coalesce((select jsonb_agg(to_jsonb(x)) from public.crm_settings x), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('email', x.email, 'full_name', x.full_name, 'role', x.role, 'driver_name', x.driver_name)) from public.profiles x), '[]'::jsonb)
  );
$$;
grant execute on function public.crm_hot_invoices(int) to authenticated;

-- what one login round trip now carries (run any time)
select jsonb_object_keys(j) as part, jsonb_array_length(j -> jsonb_object_keys(j)) as rows
from public.crm_hot_invoices(90) j;
