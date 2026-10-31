-- Deck Kingdom Ops — WooCommerce feed (website -> ops).
-- The "DK Ops Feed" snippet on the website sends new and changed orders, and sample
-- requests from the /sample-request/ form, through woo_sync().
--
--   * Products on an order become an invoice (id web-i-<order id>, order ref WEB-<order no>),
--     with no invoice number yet: while FileMaker is the master, FileMaker numbers it, and
--     when the FileMaker feed sends that job (its order ref containing the web order number)
--     it is merged into this same invoice instead of making a second one.
--   * Sample products on an order become a sample request (web-s-o<order id>).
--   * The sample request form becomes a sample request (web-s-r<request id>).
--   * Customers are matched by email address; new ones are created without an account
--     number (FileMaker gives them one and the FileMaker feed fills it in).
--
-- Secret (the value is in the snippet you paste into the website, not kept in the code):
--   insert into public.crm_settings (key, value) values ('wooBridge', jsonb_build_object('secret', 'PASTE-SECRET'))
--   on conflict (key) do update set value = excluded.value;
-- Run 024_filemaker_bridge.sql first. Safe to re-run.

create or replace function public.web_customer(c jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(c ->> 'email', '')));
  cid text;
  nm text := trim(coalesce(nullif(trim(c ->> 'company'), ''), trim(coalesce(c ->> 'first', '') || ' ' || coalesce(c ->> 'last', ''))));
  v_phone text := trim(coalesce(c ->> 'phone', ''));
  addr text := trim(both ', ' from coalesce(c ->> 'address1', '') || ', ' || coalesce(c ->> 'address2', ''));
begin
  if v_email = '' then return null; end if;
  select id into cid from public.customers where lower(customers.email) = v_email order by (account_no is not null) desc, updated_at desc limit 1;
  if cid is null then
    cid := 'web-c-' || md5(v_email);
    insert into public.customers (id, name, address, town, postcode, contact, landline, mobile, email, source, created, created_by)
    values (cid, nm, addr, coalesce(c ->> 'city', ''), upper(coalesce(c ->> 'postcode', '')),
            case when nullif(trim(c ->> 'company'), '') is not null then trim(coalesce(c ->> 'first', '') || ' ' || coalesce(c ->> 'last', '')) else '' end,
            case when v_phone ~ '^\s*(\+44\s*7|07)' then '' else v_phone end,
            case when v_phone ~ '^\s*(\+44\s*7|07)' then v_phone else '' end,
            v_email, 'Website', to_char(now(), 'YYYY-MM-DD'), 'Website')
    on conflict (id) do nothing;
  else
    -- an existing account: only fill in what's blank (FileMaker's details win)
    update public.customers set
      name = case when name = '' then nm else name end,
      address = case when address = '' then addr else address end,
      town = case when town = '' then coalesce(c ->> 'city', '') else town end,
      postcode = case when postcode = '' then upper(coalesce(c ->> 'postcode', '')) else postcode end,
      mobile = case when mobile = '' and landline = '' and v_phone ~ '^\s*(\+44\s*7|07)' then v_phone else mobile end,
      landline = case when landline = '' and mobile = '' and v_phone !~ '^\s*(\+44\s*7|07)' then v_phone else landline end
    where id = cid and (name = '' or address = '' or town = '' or postcode = '' or (mobile = '' and landline = ''));
  end if;
  return cid;
end; $$;
revoke all on function public.web_customer(jsonb) from public;

-- next sample number: one past the highest used, kept in step with the numbering setting
create or replace function public.next_sample_no()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  n := greatest(coalesce((select max(sample_no) from public.samples), 0) + 1,
                coalesce((select (value ->> 'sample')::int from public.crm_settings where key = 'numbering'), 1));
  update public.crm_settings set value = jsonb_set(value, '{sample}', to_jsonb(n + 1)) where key = 'numbering';
  return n;
end; $$;
revoke all on function public.next_sample_no() from public;

create or replace function public.woo_sync(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'wooBridge');
  o jsonb; it jsonb; r jsonb; s text;
  cid text; iid text; sid text; site text; n int;
  fm_owned boolean;
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
        update public.invoices set job_notes = 'WEBSITE: order ' || (o ->> 'status') || '. ' || job_notes
          where id = iid and job_notes not like 'WEBSITE: order %';
      else
        -- deliver-to address as a site when it differs from the billing address
        site := '';
        if nullif(trim(o #>> '{shipping,postcode}'), '') is not null
           and (upper(replace(o #>> '{shipping,postcode}', ' ', '')) <> upper(replace(coalesce(o #>> '{billing,postcode}', ''), ' ', ''))
                or lower(coalesce(o #>> '{shipping,address1}', '')) <> lower(coalesce(o #>> '{billing,address1}', ''))) then
          site := 'web-st-' || md5(cid || upper(replace(o #>> '{shipping,postcode}', ' ', '')) || lower(coalesce(o #>> '{shipping,address1}', '')));
          insert into public.customer_sites (id, customer_id, name, address, town, postcode, contact)
          values (site, cid, coalesce(nullif(trim(o #>> '{shipping,company}'), ''), 'Delivery address'),
                  trim(both ', ' from coalesce(o #>> '{shipping,address1}', '') || ', ' || coalesce(o #>> '{shipping,address2}', '')),
                  coalesce(o #>> '{shipping,city}', ''), upper(o #>> '{shipping,postcode}'),
                  trim(coalesce(o #>> '{shipping,first}', '') || ' ' || coalesce(o #>> '{shipping,last}', '')))
          on conflict (id) do nothing;
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
          values (sid || '-' || n, sid, coalesce(it ->> 'name', ''), coalesce(it ->> 'colour', ''), 'Free', coalesce(nullif(it ->> 'qty', '')::numeric, 1), n);
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
