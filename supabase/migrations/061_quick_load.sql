-- Deck Kingdom Ops — fast first paint.
-- One round trip returns the "hot" slice of the invoice book: anything not yet
-- delivered, anything unpaid (historic FileMaker imports before 2026-01-01
-- count as settled), and anything raised or delivered in the last p_days days
-- - plus the lines and picks belonging to those jobs. The app paints from
-- this, then quietly pulls the full history behind it. Runs as the caller,
-- so normal RLS applies. Safe to re-run.
create or replace function public.crm_hot_invoices(p_days int default 90)
returns jsonb language sql stable as $$
  with cutoff as (select to_char(current_date - make_interval(days => p_days), 'YYYY-MM-DD') as d),
  hot as (
    select i.* from public.invoices i, cutoff
    where i.delivery_completed = false
       or (coalesce(i.payment_date, '') = '' and not (i.id like 'fm-i-%' and i.date < '2026-01-01'))
       or i.date >= cutoff.d
       or i.delivery_date >= cutoff.d
  )
  select jsonb_build_object(
    'invoices', coalesce((select jsonb_agg(to_jsonb(h) order by h.position, h.id) from hot h), '[]'::jsonb),
    'items',    coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.invoice_items x where x.invoice_id in (select id from hot)), '[]'::jsonb),
    'picks',    coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.id) from public.invoice_picks x where x.invoice_id in (select id from hot)), '[]'::jsonb)
  );
$$;
grant execute on function public.crm_hot_invoices(int) to authenticated;
