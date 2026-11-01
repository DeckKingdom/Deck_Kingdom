-- Deck Kingdom Ops — website refunds and cancellations
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
-- Needs job-risk-flags.sql to have been run first.
--  * full refund / cancelled on the website -> the job is marked void (web_status):
--    it drops off the delivery schedule and out of the sales figures
--  * any refund -> a "Website refund" minus line on the invoice, so the total matches
--    what was actually taken; a part refund marks the job for a check
alter table public.invoices add column if not exists web_status text not null default ''; -- '' | refunded | cancelled | failed | partial refund

create or replace function public.woo_sync(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'wooBridge');
  o jsonb; it jsonb; r jsonb; s text;
  cid text; iid text; sid text; site text; n int;
  fm_owned boolean;
  rf jsonb; refunded numeric;
  na jsonb;
  goods jsonb; samples jsonb;
  dead boolean;
  inv_count int := 0; smp_count int := 0; skipped jsonb := '[]'::jsonb;
begin
  if want is null or length(want) < 20 or p_secret is distinct from want then
    raise exception 'woo_sync: not authorised';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('email', 'Website')::text, true);

  -- ===== website orders =====
  for o in select * from jsonb_array_elements(coalesce(p_payload -> 'orders', '[]'::jsonb)) loop
    dead := (o ->> 'status') in ('cancelled', 'refunded', 'failed', 'trash');
    -- cancelled before it ever reached ops: nothing to do (and no customer to make)
    if dead and not exists (select 1 from public.invoices where id = 'web-i-' || (o ->> 'wooId')) then continue; end if;
    cid := public.web_customer(o -> 'billing');
    if cid is null then
      skipped := skipped || jsonb_build_object('order', o ->> 'number', 'reason', 'no email address');
      continue;
    end if;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into goods from jsonb_array_elements(coalesce(o -> 'items', '[]'::jsonb)) x where not coalesce((x ->> 'isSample')::boolean, false);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into samples from jsonb_array_elements(coalesce(o -> 'items', '[]'::jsonb)) x where coalesce((x ->> 'isSample')::boolean, false);

    -- products -> invoice
    if jsonb_array_length(goods) > 0 then
      iid := 'web-i-' || (o ->> 'wooId');
      fm_owned := exists (select 1 from public.fm_links where kind = 'invoice' and ops_id = iid);
      if dead and not exists (select 1 from public.invoices where id = iid) then
        null; -- cancelled before it ever reached ops: nothing to do
      elsif dead then
        -- refunded / cancelled on the website: the job is void (off the schedule, out of sales)
        update public.invoices set job_notes = 'WEBSITE: order ' || (o ->> 'status') || '. ' || job_notes
          where id = iid and job_notes not like 'WEBSITE: order %';
        update public.invoices set web_status = (o ->> 'status') where id = iid and web_status is distinct from (o ->> 'status');
      else
        -- every website order gets a delivery site:
        --   1. the website's shipping address when it differs from billing
        --   2. else an address typed into the order note (postcode other than billing)
        --   3. else the billing address itself (so the job always has a site)
        -- an existing site of the customer's at the same address is reused
        site := '';
        if nullif(trim(o #>> '{shipping,postcode}'), '') is not null
           and (upper(regexp_replace(o #>> '{shipping,postcode}', '[^A-Za-z0-9]', '', 'g')) <> upper(regexp_replace(coalesce(o #>> '{billing,postcode}', ''), '[^A-Za-z0-9]', '', 'g'))
                or lower(coalesce(o #>> '{shipping,address1}', '')) <> lower(coalesce(o #>> '{billing,address1}', ''))) then
          site := public.dk_web_site(cid,
            public.dk_title(trim(both ', ' from coalesce(o #>> '{shipping,address1}', '') || ', ' || coalesce(o #>> '{shipping,address2}', ''))),
            public.dk_title(o #>> '{shipping,city}'), o #>> '{shipping,postcode}',
            public.dk_title(trim(coalesce(o #>> '{shipping,first}', '') || ' ' || coalesce(o #>> '{shipping,last}', ''))),
            coalesce(o #>> '{billing,phone}', ''), coalesce(o #>> '{billing,email}', ''), '');
        end if;
        if site = '' then
          na := public.dk_note_address(o ->> 'customerNote');
          if na is not null and upper(replace(na ->> 'postcode', '-', '')) <> upper(regexp_replace(coalesce(o #>> '{billing,postcode}', ''), '[^A-Za-z0-9]', '', 'g')) then
            site := public.dk_web_site(cid, na ->> 'address', na ->> 'town', na ->> 'postcode',
              public.dk_title(trim(coalesce(o #>> '{billing,first}', '') || ' ' || coalesce(o #>> '{billing,last}', ''))),
              coalesce(o #>> '{billing,phone}', ''), coalesce(o #>> '{billing,email}', ''),
              'Delivery address from the website order note: ' || trim(o ->> 'customerNote'));
          end if;
        end if;
        if site = '' and nullif(trim(o #>> '{billing,postcode}'), '') is not null then
          site := public.dk_web_site(cid,
            public.dk_title(trim(both ', ' from coalesce(o #>> '{billing,address1}', '') || ', ' || coalesce(o #>> '{billing,address2}', ''))),
            public.dk_title(o #>> '{billing,city}'), o #>> '{billing,postcode}',
            public.dk_title(trim(coalesce(o #>> '{billing,first}', '') || ' ' || coalesce(o #>> '{billing,last}', ''))),
            coalesce(o #>> '{billing,phone}', ''), coalesce(o #>> '{billing,email}', ''), '');
        end if;
        insert into public.invoices as t (id, customer_id, site_id, date, order_ref, job_type, payment_type, payment_date,
                                          delivery_charge, job_notes, raised_by, created, created_by)
        values (iid, cid, site, coalesce(o ->> 'date', ''), 'WEB-' || (o ->> 'number'),
                case when lower(coalesce(o ->> 'shippingMethod', '')) ~ '(collect|pick ?up|pickup)' then 'Customer Collection' else 'Delivery Run 1' end,
                case when coalesce(o ->> 'paymentMethod', '') = '' then 'Website' else 'Website · ' || (o ->> 'paymentMethod') end,
                coalesce(o ->> 'datePaid', ''), nullif(o ->> 'shippingTotal', '')::numeric,
                trim(coalesce(o ->> 'customerNote', '')), 'Website', coalesce(o ->> 'date', ''), 'Website')
        on conflict (id) do update set
          -- once FileMaker has this job, FileMaker's details win; the website only adds the payment
          customer_id = case when fm_owned then t.customer_id else excluded.customer_id end,
          site_id = case when fm_owned or t.site_id <> '' then t.site_id else excluded.site_id end,
          payment_date = case when t.payment_date = '' then excluded.payment_date else t.payment_date end,
          payment_type = case when fm_owned then t.payment_type else excluded.payment_type end,
          delivery_charge = case when fm_owned then t.delivery_charge else excluded.delivery_charge end;
        -- Stripe / payment risk from the website: flag the job until someone has checked it
        if coalesce(o #>> '{risk,level}', '') <> '' then
          update public.invoices set risk_flag = o #>> '{risk,level}', risk_note = left(coalesce(o #>> '{risk,note}', ''), 500)
           where id = iid and risk_checked = '' and risk_flag <> 'manual';
        end if;
        if not fm_owned then
          delete from public.invoice_items where invoice_id = iid and id like 'web-l-%';
          n := 0;
          for it in select * from jsonb_array_elements(goods) loop
            insert into public.invoice_items (id, invoice_id, code, description, colour, qty, price, position)
            values ('web-l-' || (o ->> 'wooId') || '-' || n, iid, coalesce(it ->> 'sku', ''), coalesce(it ->> 'name', ''),
                    coalesce(it ->> 'colour', ''), coalesce(nullif(it ->> 'qty', '')::numeric, 0), coalesce(nullif(it ->> 'price', '')::numeric, 0), n);
            n := n + 1;
          end loop;
        end if;
        inv_count := inv_count + 1;
      end if;

      -- refunds: a minus line each (so the total matches what was taken), and a part-refund marker
      if exists (select 1 from public.invoices where id = iid) then
        refunded := coalesce(nullif(o ->> 'refundTotal', '')::numeric, 0);
        if not fm_owned then
          for rf in select * from jsonb_array_elements(coalesce(o -> 'refunds', '[]'::jsonb)) loop
            insert into public.invoice_items as li (id, invoice_id, code, description, colour, qty, price, position)
            values ('web-r-' || (rf ->> 'id'), iid, '', 'Website refund' || coalesce(nullif(' — ' || trim(coalesce(rf ->> 'reason', '')), ' — '), '') || coalesce(' (' || nullif(rf ->> 'date', '') || ')', ''),
                    '', 1, -abs(coalesce(nullif(rf ->> 'amount', '')::numeric, 0)), 900)
            on conflict (id) do update set price = excluded.price, description = excluded.description;
          end loop;
        end if;
        if not dead then
          update public.invoices set web_status = case when refunded > 0 then 'partial refund' else '' end
           where id = iid and web_status is distinct from (case when refunded > 0 then 'partial refund' else '' end);
        end if;
      end if;
    end if;

    -- sample products -> sample request
    if jsonb_array_length(samples) > 0 and not dead then
      sid := 'web-s-o' || (o ->> 'wooId');
      if not exists (select 1 from public.samples where id = sid) then
        insert into public.samples (id, sample_no, customer_id, date, source, notes, raised_by, created, created_by)
        values (sid, public.next_sample_no(), cid, coalesce(o ->> 'date', ''), 'Website order',
                'Web order ' || (o ->> 'number') || coalesce(nullif(' — ' || trim(coalesce(o ->> 'customerNote', '')), ' — '), ''),
                'Website', coalesce(o ->> 'date', ''), 'Website');
        n := 0;
        for it in select * from jsonb_array_elements(samples) loop
          insert into public.sample_items (id, sample_id, description, colour, size, qty, position)
          values (sid || '-' || n, sid, coalesce(it ->> 'name', ''), coalesce(it ->> 'colour', ''), coalesce(nullif(it ->> 'size', ''), 'Free'), coalesce(nullif(it ->> 'qty', '')::numeric, 1), n);
          n := n + 1;
        end loop;
        smp_count := smp_count + 1;
      end if;
    end if;
  end loop;

  -- ===== sample request form =====
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'sampleRequests', '[]'::jsonb)) loop
    cid := public.web_customer(jsonb_build_object('email', r ->> 'email', 'first', r ->> 'first', 'last', r ->> 'last',
             'phone', r ->> 'phone', 'address1', trim(coalesce(r ->> 'house', '') || ' ' || coalesce(r ->> 'street', '')),
             'city', r ->> 'town', 'postcode', r ->> 'postcode'));
    if cid is null then
      skipped := skipped || jsonb_build_object('sampleRequest', r ->> 'srId', 'reason', 'no email address');
      continue;
    end if;
    sid := 'web-s-r' || (r ->> 'srId');
    if exists (select 1 from public.samples where id = sid) then continue; end if;
    insert into public.samples (id, sample_no, customer_id, date, source, notes, raised_by, created, created_by)
    values (sid, public.next_sample_no(), cid, coalesce(r ->> 'date', ''), 'Sample request form',
            trim(coalesce(r ->> 'notes', '')), 'Website', coalesce(r ->> 'date', ''), 'Website');
    n := 0;
    for s in select jsonb_array_elements_text(coalesce(r -> 'samples', '[]'::jsonb)) loop
      -- "Composite Decking — Grey": product before the dash, colour after
      insert into public.sample_items (id, sample_id, description, colour, size, qty, position)
      values (sid || '-' || n, sid, trim(split_part(s, ' — ', 1)), trim(coalesce(nullif(split_part(s, ' — ', 2), ''), '')), 'Free', 1, n);
      n := n + 1;
    end loop;
    smp_count := smp_count + 1;
  end loop;

  insert into public.crm_settings (key, value) values ('wooBridgeLast',
    jsonb_build_object('at', now(), 'invoices', inv_count, 'samples', smp_count, 'skipped', skipped))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('invoices', inv_count, 'samples', smp_count, 'skipped', skipped);
end; $$;

revoke all on function public.woo_sync(text, jsonb) from public;
grant execute on function public.woo_sync(text, jsonb) to anon, authenticated;

-- jobs already refunded / cancelled on the website (their notes say so)
update public.invoices set web_status = substring(job_notes from '^WEBSITE: order ([a-z-]+)\.')
 where id like 'web-i-%' and web_status = '' and job_notes ~ '^WEBSITE: order (refunded|cancelled|failed|trash)\.';
