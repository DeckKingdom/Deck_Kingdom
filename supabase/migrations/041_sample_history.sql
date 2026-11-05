-- Deck Kingdom Ops - bring in past website sample orders (and sample-form requests) for the conversion figures
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- The website's "Sample history" page (DK Ops Sample History snippet) sends past orders here.
-- Only the sample lines are used: no jobs are made, so nothing can clash with FileMaker's jobs.
-- Customers are matched by email (or created), just like live website orders.
-- Imported samples are marked as sent and followed up, so they don't land in the
-- "To send" / "Follow-up due" lists — they're there for the figures.

create or replace function public.woo_sample_history(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ids text[]; before text[]; res jsonb; clean jsonb; added int;
begin
  -- orders: keep the sample lines only (and only orders that have one)
  clean := jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(o || jsonb_build_object('items', (select jsonb_agg(x) from jsonb_array_elements(o -> 'items') x where coalesce((x ->> 'isSample')::boolean, false))))
        from jsonb_array_elements(coalesce(p_payload -> 'orders', '[]'::jsonb)) o
       where exists (select 1 from jsonb_array_elements(coalesce(o -> 'items', '[]'::jsonb)) x where coalesce((x ->> 'isSample')::boolean, false))
         and coalesce(o ->> 'status', '') not in ('cancelled', 'refunded', 'failed', 'trash')), '[]'::jsonb),
    'sampleRequests', coalesce(p_payload -> 'sampleRequests', '[]'::jsonb));

  ids := array(select 'web-s-o' || (x ->> 'wooId') from jsonb_array_elements(clean -> 'orders') x
               union all select 'web-s-r' || (x ->> 'srId') from jsonb_array_elements(clean -> 'sampleRequests') x);
  before := array(select id from public.samples where id = any(ids));

  res := public.woo_sync(p_secret, clean); -- checks the secret too

  update public.samples set
    dispatched_date = case when dispatched_date = '' then date else dispatched_date end,
    followed_up = true,
    followed_up2_date = case when followed_up2_date = '' then date else followed_up2_date end,
    notes = trim('Imported from website history. ' || notes)
   where id = any(ids) and not (id = any(before));
  get diagnostics added = row_count;
  return res || jsonb_build_object('added', added, 'alreadyThere', coalesce(array_length(before, 1), 0));
end; $$;

revoke all on function public.woo_sample_history(text, jsonb) from public;
grant execute on function public.woo_sample_history(text, jsonb) to anon, authenticated;
