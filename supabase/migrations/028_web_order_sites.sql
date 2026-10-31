-- Deck Kingdom Ops — every website order gets a delivery site
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run;
-- replaces the earlier "web-note-address" script, no need to run that one too).
-- Site = the website's shipping address if different, else an address typed in the
-- order note, else the account's own address. Existing orders without a site are filled in.

-- find the customer's site at this address, or make one; returns the site id
create or replace function public.dk_web_site(p_cid text, p_address text, p_town text, p_postcode text,
                                              p_contact text, p_phone text, p_email text, p_notes text)
returns text language plpgsql security definer set search_path = public as $$
declare pc text := upper(regexp_replace(coalesce(p_postcode, ''), '[^A-Za-z0-9]', '', 'g'));
        a6 text := lower(left(regexp_replace(coalesce(p_address, ''), '[^A-Za-z0-9]', '', 'g'), 6));
        sid text; nxt int;
begin
  if pc = '' then return ''; end if;
  select id into sid from public.customer_sites
   where customer_id = p_cid and upper(regexp_replace(postcode, '[^A-Za-z0-9]', '', 'g')) = pc
     and (a6 = '' or address = '' or lower(left(regexp_replace(address, '[^A-Za-z0-9]', '', 'g'), 6)) = a6)
   order by site_no nulls last, id limit 1;
  if sid is not null then return sid; end if;
  sid := 'web-st-' || md5(p_cid || pc || a6);
  select coalesce(max(site_no), 0) + 1 into nxt from public.customer_sites;
  insert into public.customer_sites (id, customer_id, site_no, name, address, town, postcode, contact, mobile, landline, email, notes)
  values (sid, p_cid, nxt, coalesce(nullif(split_part(coalesce(p_address, ''), ',', 1), ''), 'Delivery address'),
          coalesce(p_address, ''), coalesce(p_town, ''), public.dk_postcode(p_postcode), coalesce(p_contact, ''),
          case when regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') ~ '^(07|447)' then public.dk_phone(p_phone) else '' end,
          case when regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') ~ '^(07|447)' then '' else public.dk_phone(p_phone) end,
          lower(trim(coalesce(p_email, ''))), coalesce(p_notes, ''))
  on conflict (id) do nothing;
  return sid;
end; $$;

create or replace function public.dk_note_address(note text) returns jsonb
language plpgsql immutable as $$
declare
  t text := coalesce(note, '');
  m text[]; pc text; before text; parts text[]; seg text; town text := ''; addr text[] := '{}'; k int;
begin
  m := regexp_match(t, '(?:^|[^A-Za-z0-9])([A-Za-z]{1,2}[0-9][A-Za-z0-9]?)\s*([0-9][A-Za-z]{2})(?![A-Za-z0-9])');
  if m is null then return null; end if;
  pc := public.dk_postcode(m[1] || m[2]);
  -- text before the postcode, without the "please deliver to:" lead-in
  before := split_part(t, substring(t from '(?:^|[^A-Za-z0-9])(' || m[1] || '\s*' || m[2] || ')'), 1);
  before := regexp_replace(before, '^.*\m(deliver(y|ed)?( address)?|ship(ping)?( address)?|send( it)?|drop( off)?|address)\M\s*(to|is|at|for)?\s*[:\-]?', '', 'i');
  before := regexp_replace(before, '^\s*(the |our |my )?(site|job|house|property)\s+(is\s+)?(at|is)\s+', '', 'i');
  parts := regexp_split_to_array(regexp_replace(before, '[\r\n]+', ',', 'g'), '\s*,\s*');
  -- last few non-empty pieces: the one before the postcode is the town if it has no numbers
  for k in reverse coalesce(array_length(parts, 1), 0) .. 1 loop
    seg := trim(both ' .;' from parts[k]);
    continue when seg = '';
    if town = '' and array_length(addr, 1) is null and seg !~ '[0-9]' and k > 1 then
      town := seg;
    else
      addr := seg || addr;
    end if;
    exit when array_length(addr, 1) >= 3;
  end loop;
  return jsonb_build_object('address', public.dk_title(array_to_string(addr, ', ')), 'town', public.dk_title(town), 'postcode', pc);
end; $$;

create or replace function public.woo_sync(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'wooBridge');
  o jsonb; it jsonb; r jsonb; s text;
  cid text; iid text; sid text; site text; n int;
  fm_owned boolean;
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
        update public.invoices set job_notes = 'WEBSITE: order ' || (o ->> 'status') || '. ' || job_notes
          where id = iid and job_notes not like 'WEBSITE: order %';
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

-- ===== one-off: website orders already in ops with no site =====
do $$
declare v record; na jsonb; sid text;
begin
  for v in select i.id, i.customer_id, i.job_notes, c.address, c.town, c.postcode, c.contact, c.mobile, c.landline, c.email
           from public.invoices i join public.customers c on c.id = i.customer_id
           where i.id like 'web-i-%' and coalesce(i.site_id, '') = ''
             and not exists (select 1 from public.fm_links l where l.kind = 'invoice' and l.ops_id = i.id) loop
    sid := '';
    na := public.dk_note_address(regexp_replace(v.job_notes, '^WEBSITE: order [a-z-]+\.\s*', ''));
    if na is not null and upper(replace(na ->> 'postcode', '-', '')) <> upper(regexp_replace(coalesce(v.postcode, ''), '[^A-Za-z0-9]', '', 'g')) then
      sid := public.dk_web_site(v.customer_id, na ->> 'address', na ->> 'town', na ->> 'postcode', v.contact, coalesce(nullif(v.mobile, ''), v.landline), v.email,
                                'Delivery address from the website order note: ' || trim(v.job_notes));
    end if;
    if sid = '' then
      sid := public.dk_web_site(v.customer_id, v.address, v.town, v.postcode, v.contact, coalesce(nullif(v.mobile, ''), v.landline), v.email, '');
    end if;
    if sid <> '' then update public.invoices set site_id = sid where id = v.id; end if;
  end loop;
end $$;
