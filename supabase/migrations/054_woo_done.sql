-- Deck Kingdom Ops — the website asks what's been finished in ops (ops -> website).
-- The DK Ops Feed snippet calls woo_done() on its 5-minute run, then:
--   * marks WooCommerce orders Completed once ops has finished everything on them:
--       - the order's job (invoice web-i-<order id>) is delivered, AND
--       - any sample line on it (web-s-o<order id>) is dispatched;
--   * marks /sample-request/ form entries handled once their sample is dispatched.
-- Looks back 90 days so the reply stays small. Same secret as woo_sync. Safe to re-run.

create or replace function public.woo_done(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'wooBridge');
  v_orders jsonb;
  v_reqs jsonb;
begin
  if want is null or length(want) < 20 or p_secret is distinct from want then
    raise exception 'bad secret';
  end if;

  -- a web order is done only when EVERY ops record made from it is done
  -- (an order with decking and a sample: delivered job + dispatched sample)
  with ids as (
    select substr(id, 7) as wid, delivery_completed as done
    from public.invoices
    where id like 'web-i-%' and updated_at >= now() - interval '90 days'
    union all
    select substr(id, 8) as wid, (coalesce(dispatched_date, '') <> '') as done
    from public.samples
    where id like 'web-s-o%' and updated_at >= now() - interval '90 days'
  )
  select coalesce(jsonb_agg(wid), '[]'::jsonb) into v_orders
  from (select wid from ids group by wid having bool_and(done)) d;

  select coalesce(jsonb_agg(substr(id, 8)), '[]'::jsonb) into v_reqs
  from public.samples
  where id like 'web-s-r%' and coalesce(dispatched_date, '') <> ''
    and updated_at >= now() - interval '90 days';

  return jsonb_build_object('orders', v_orders, 'requests', v_reqs);
end $$;

grant execute on function public.woo_done(text) to anon, authenticated;
