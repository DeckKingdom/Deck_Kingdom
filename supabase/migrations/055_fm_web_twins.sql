-- Deck Kingdom Ops - FileMaker jobs join up with their website order even without the order number (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- A website order lands in ops straight away (web-i-...). When it's keyed into FileMaker the bridge
-- joins the two up by the "WEB-12345" order ref - but when FileMaker's Order Ref is left blank the
-- FileMaker copy became a second job, and the website copy sat on Pending looking unbooked.
-- Now a FileMaker job with no web ref is matched to a website order that isn't joined up yet when
-- they have the same delivery postcode, are dated within 21 days, and their goods total the same.
--
-- dk_join_web_twins() fixes the pairs already in ops: run the preview first, then apply.
--   select * from public.dk_join_web_twins(false);   -- list the pairs, change nothing
--   select * from public.dk_join_web_twins(true);    -- join them up
-- Joining keeps the website job (so the website still gets marked Completed), gives it FileMaker's
-- job number, dates, payment and ticks, moves anything hung on the FileMaker copy across to it,
-- and removes the FileMaker copy. The next FileMaker send then updates the website job.

-- the postcode a job is going to (its site's, else the customer's), letters and digits only
create or replace function public.dk_job_pc(p_site text, p_cust text) returns text language sql stable as $$
  select upper(regexp_replace(coalesce(
    nullif((select postcode from public.customer_sites where id = p_site), ''),
    (select postcode from public.customers where id = p_cust), ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- a website order that is the same job as this FileMaker invoice (payload), or null
create or replace function public.dk_web_twin(i jsonb, p_site text, p_cust text) returns text language plpgsql stable as $$
declare pc text; d date; tot numeric; hit text;
begin
  pc := public.dk_job_pc(coalesce(p_site, ''), coalesce(p_cust, ''));
  if pc = '' or coalesce(i ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  d := (i ->> 'date')::date;
  select coalesce(sum(coalesce(nullif(x ->> 'qty', '')::numeric, 0) * coalesce(nullif(x ->> 'price', '')::numeric, 0)), 0)
    into tot from jsonb_array_elements(coalesce(i -> 'lines', '[]'::jsonb)) x;
  if tot <= 0 then return null; end if;
  select w.id into hit
    from public.invoices w
   where w.id like 'web-i-%'
     and not exists (select 1 from public.fm_links k where k.kind = 'invoice' and k.ops_id = w.id)
     and w.date ~ '^\d{4}-\d{2}-\d{2}' and abs(w.date::date - d) <= 21
     and public.dk_job_pc(w.site_id, w.customer_id) = pc
     and abs((select coalesce(sum(qty * price), 0) from public.invoice_items where invoice_id = w.id) - tot) < 1
   order by abs(w.date::date - d)
   limit 1;
  return hit;
end; $$;

create or replace function public.fm_sync(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'fmBridge');
  c jsonb; i jsonb; l jsonb; st jsonb;
  cid text; iid text; sid text; n int; runm text[];
  cust_count int := 0; inv_count int := 0; line_count int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  if want is null or length(want) < 20 or p_secret is distinct from want then
    raise exception 'fm_sync: not authorised';
  end if;
  -- stamp and audit as "FileMaker" rather than "system"
  perform set_config('request.jwt.claims', jsonb_build_object('email', 'FileMaker')::text, true);

  -- ===== customers =====
  for c in select * from jsonb_array_elements(coalesce(p_payload -> 'customers', '[]'::jsonb)) loop
    cid := (select ops_id from public.fm_links where kind = 'customer' and fm_id = c ->> 'fmId');
    if cid is null then
      -- an account already keyed in by hand with the same account number is the same customer
      if coalesce(c ->> 'accountNo', '') ~ '^\d{1,9}$' then
        select id into cid from public.customers where account_no = (c ->> 'accountNo')::int order by (id like 'fm-c-%') limit 1;
      end if;
      -- or one that came in from the website with the same email address
      if cid is null and nullif(trim(c ->> 'email'), '') is not null then
        select id into cid from public.customers where lower(email) = lower(trim(c ->> 'email')) order by (account_no is not null) desc limit 1;
      end if;
      cid := coalesce(cid, 'fm-c-' || (c ->> 'fmId'));
      insert into public.fm_links (kind, fm_id, ops_id) values ('customer', c ->> 'fmId', cid) on conflict do nothing;
    end if;
    insert into public.customers as t (id, account_no, name, address, town, postcode, contact, landline, mobile, email, source, trader, created, created_by)
    values (cid, case when coalesce(c ->> 'accountNo', '') ~ '^\d{1,9}$' then (c ->> 'accountNo')::int end,
            -- no company name in FileMaker: the contact's name is the account name
            public.dk_title(coalesce(nullif(trim(c ->> 'name'), ''), c ->> 'contact')), public.dk_title(c ->> 'address'), public.dk_title(c ->> 'town'),
            public.dk_postcode(c ->> 'postcode'), public.dk_title(c ->> 'contact'), public.dk_phone(c ->> 'landline'), public.dk_phone(c ->> 'mobile'),
            lower(trim(coalesce(c ->> 'email', ''))), public.dk_title(c ->> 'source'), coalesce((c ->> 'trader')::boolean, false), coalesce(c ->> 'created', ''), 'FileMaker')
    on conflict (id) do update set
      account_no = excluded.account_no, name = excluded.name, address = excluded.address, town = excluded.town,
      postcode = excluded.postcode, contact = excluded.contact, landline = excluded.landline, mobile = excluded.mobile,
      email = excluded.email, source = excluded.source, trader = excluded.trader,
      created = case when t.created = '' then excluded.created else t.created end;
    cust_count := cust_count + 1;
  end loop;

  -- ===== customer sites (delivery addresses) =====
  for st in select * from jsonb_array_elements(coalesce(p_payload -> 'sites', '[]'::jsonb)) loop
    cid := (select ops_id from public.fm_links where kind = 'customer' and fm_id = st ->> 'customerFmId');
    if cid is null then continue; end if;
    sid := coalesce((select ops_id from public.fm_links where kind = 'site' and fm_id = st ->> 'fmId'), 'fm-st-' || (st ->> 'fmId'));
    insert into public.fm_links (kind, fm_id, ops_id) values ('site', st ->> 'fmId', sid) on conflict do nothing;
    insert into public.customer_sites as t (id, customer_id, site_no, name, address, town, postcode, contact, landline, mobile, email, notes)
    values (sid, cid, case when coalesce(st ->> 'fmId', '') ~ '^\d{1,9}$' then (st ->> 'fmId')::int end,
            coalesce(nullif(public.dk_title(st ->> 'name'), ''), nullif(public.dk_title(st ->> 'address'), ''), 'Site ' || (st ->> 'fmId')),
            public.dk_title(st ->> 'address'), public.dk_title(st ->> 'town'),
            public.dk_postcode(st ->> 'postcode'), public.dk_title(st ->> 'contact'), public.dk_phone(st ->> 'landline'), public.dk_phone(st ->> 'mobile'),
            lower(trim(coalesce(st ->> 'email', ''))), trim(coalesce(st ->> 'notes', '')))
    on conflict (id) do update set
      customer_id = excluded.customer_id, address = excluded.address, town = excluded.town, postcode = excluded.postcode,
      contact = excluded.contact, landline = excluded.landline, mobile = excluded.mobile, email = excluded.email, notes = excluded.notes;
  end loop;

  -- ===== invoices + their lines =====
  for i in select * from jsonb_array_elements(coalesce(p_payload -> 'invoices', '[]'::jsonb)) loop
    iid := (select ops_id from public.fm_links where kind = 'invoice' and fm_id = i ->> 'fmId');
    if iid is null then
      -- a website order already in ops (order ref WEB-12345) is the same job once FileMaker has it
      if regexp_replace(coalesce(i ->> 'orderRef', ''), '\D', '', 'g') <> '' then
        select id into iid from public.invoices
          where id like 'web-i-%' and order_ref = 'WEB-' || regexp_replace(i ->> 'orderRef', '\D', '', 'g') limit 1;
      end if;
      -- no web order number on it: the same job as a website order still waiting to be joined up?
      -- same delivery postcode, dated within 3 weeks, same goods total (to the pound)
      if iid is null then
        iid := public.dk_web_twin(i, (select ops_id from public.fm_links where kind = 'site' and fm_id = i ->> 'siteFmId'),
                                     (select ops_id from public.fm_links where kind = 'customer' and fm_id = i ->> 'customerFmId'));
      end if;
      iid := coalesce(iid, 'fm-i-' || (i ->> 'fmId'));
      insert into public.fm_links (kind, fm_id, ops_id) values ('invoice', i ->> 'fmId', iid) on conflict do nothing;
    end if;
    -- the invoice's site, and its customer: by FileMaker id, else the site's customer
    sid := (select ops_id from public.fm_links where kind = 'site' and fm_id = i ->> 'siteFmId');
    cid := (select ops_id from public.fm_links where kind = 'customer' and fm_id = i ->> 'customerFmId');
    if cid is null and sid is not null then select customer_id into cid from public.customer_sites where id = sid; end if;
    if cid is null and coalesce(i ->> 'accountNo', '') ~ '^\d{1,9}$' then
      select id into cid from public.customers where account_no = (i ->> 'accountNo')::int limit 1;
    end if;
    if cid is null then
      skipped := skipped || jsonb_build_object('invoice', i ->> 'invNo', 'reason', 'customer not found');
      continue;
    end if;
    -- run number: from "Delivery Run N" in FileMaker's job type (the database turns that into job type Delivery + run N)
    runm := regexp_match(coalesce(i ->> 'jobType', ''), 'Run\s*(\d+)', 'i');
    insert into public.invoices as t (id, inv_no, customer_id, site_id, date, order_ref, job_type, van, driver, drop_no, run_no, delivery_date, delivery_time, delivery_completed,
                                      payment_type, payment_date, delivery_charge, job_notes, raised_by, created, created_by,
                                      f_booked, f_courier, f_parts_ordered, f_parts_ready, f_review_requested, f_review_received,
                                      f_photos_requested, f_social_posted, f_sample_followed)
    values (iid, case when coalesce(i ->> 'invNo', '') ~ '^\d{1,9}$' then (i ->> 'invNo')::int end, cid, coalesce(sid, ''),
            coalesce(i ->> 'date', ''), coalesce(i ->> 'orderRef', ''),
            coalesce(nullif(i ->> 'jobType', ''), 'Delivery Run 1'), trim(coalesce(i ->> 'van', '')),
            public.dk_title(trim(coalesce(i ->> 'driver', ''))),
            coalesce(nullif(substring(coalesce(i ->> 'dropNo', '') from '\d+'), ''), trim(coalesce(i ->> 'dropNo', ''))),
            coalesce(runm[1], ''),
            coalesce(i ->> 'deliveryDate', ''), coalesce(i ->> 'deliveryTime', ''),
            coalesce((i ->> 'deliveryCompleted')::boolean, false), coalesce(i ->> 'paymentType', ''), coalesce(i ->> 'paymentDate', ''),
            nullif(i ->> 'deliveryCharge', '')::numeric,
            trim(both E'\n' from coalesce(i ->> 'jobNotes', '') || case when trim(coalesce(i ->> 'deliveryNotes', '')) <> '' then E'\nDelivery: ' || trim(i ->> 'deliveryNotes') else '' end),
            coalesce(i ->> 'raisedBy', ''), coalesce(i ->> 'created', ''), 'FileMaker',
            coalesce((i ->> 'booked')::boolean, false), coalesce((i ->> 'courier')::boolean, false), coalesce((i ->> 'partsOrdered')::boolean, false),
            coalesce((i ->> 'partsReady')::boolean, false), coalesce((i ->> 'reviewRequested')::boolean, false), coalesce((i ->> 'reviewReceived')::boolean, false),
            coalesce((i ->> 'photosRequested')::boolean, false), coalesce((i ->> 'socialPosted')::boolean, false), coalesce((i ->> 'sampleFollowed')::boolean, false))
    on conflict (id) do update set
      inv_no = excluded.inv_no, customer_id = excluded.customer_id, date = excluded.date, order_ref = excluded.order_ref,
      job_type = excluded.job_type, delivery_date = excluded.delivery_date, delivery_time = excluded.delivery_time,
      -- once ticked as delivered in either system it stays delivered
      delivery_completed = t.delivery_completed or excluded.delivery_completed,
      payment_type = excluded.payment_type, payment_date = excluded.payment_date, delivery_charge = excluded.delivery_charge,
      job_notes = excluded.job_notes, raised_by = excluded.raised_by,
      site_id = case when excluded.site_id <> '' then excluded.site_id else t.site_id end,
      -- delivery schedule details: FileMaker's when it has them, otherwise whatever was set in ops
      van = case when excluded.van <> '' then excluded.van else t.van end,
      driver = case when excluded.driver <> '' then excluded.driver else t.driver end,
      drop_no = case when excluded.drop_no <> '' then excluded.drop_no else t.drop_no end,
      run_no = case when excluded.run_no <> '' then excluded.run_no else t.run_no end,
      -- checklist ticks: ticked in either system stays ticked
      f_booked = t.f_booked or excluded.f_booked, f_courier = t.f_courier or excluded.f_courier,
      f_parts_ordered = t.f_parts_ordered or excluded.f_parts_ordered, f_parts_ready = t.f_parts_ready or excluded.f_parts_ready,
      f_review_requested = t.f_review_requested or excluded.f_review_requested, f_review_received = t.f_review_received or excluded.f_review_received,
      f_photos_requested = t.f_photos_requested or excluded.f_photos_requested, f_social_posted = t.f_social_posted or excluded.f_social_posted,
      f_sample_followed = t.f_sample_followed or excluded.f_sample_followed;
    inv_count := inv_count + 1;

    -- lines: FileMaker's list replaces the invoice's lines when it sends any -- but only if they differ,
    -- so the every-minute resend doesn't churn rows (or the audit log) for nothing
    if jsonb_array_length(coalesce(i -> 'lines', '[]'::jsonb)) > 0
       and (select coalesce(jsonb_agg(jsonb_build_array(code, description, colour, qty::float8, price::float8) order by position), '[]'::jsonb)
              from public.invoice_items where invoice_id = iid and (id like 'fm-l-%' or id like 'web-l-%'))
           is distinct from
           (select coalesce(jsonb_agg(jsonb_build_array(coalesce(x ->> 'code', ''), coalesce(x ->> 'description', ''), coalesce(x ->> 'colour', ''),
                                                       coalesce(nullif(x ->> 'qty', '')::numeric, 0)::float8, coalesce(nullif(x ->> 'price', '')::numeric, 0)::float8) order by ord), '[]'::jsonb)
              from jsonb_array_elements(i -> 'lines') with ordinality as e(x, ord)) then
      delete from public.invoice_items where invoice_id = iid and (id like 'fm-l-%' or id like 'web-l-%');
      n := 0;
      for l in select * from jsonb_array_elements(i -> 'lines') loop
        insert into public.invoice_items (id, invoice_id, code, description, colour, qty, price, position)
        values ('fm-l-' || (i ->> 'fmId') || '-' || n, iid, coalesce(l ->> 'code', ''), coalesce(l ->> 'description', ''),
                coalesce(l ->> 'colour', ''), coalesce(nullif(l ->> 'qty', '')::numeric, 0), coalesce(nullif(l ->> 'price', '')::numeric, 0), n);
        n := n + 1;
        line_count := line_count + 1;
      end loop;
    end if;
  end loop;

  insert into public.crm_settings (key, value) values ('fmBridgeLast',
    jsonb_build_object('at', now(), 'customers', cust_count, 'invoices', inv_count, 'lines', line_count, 'skipped', skipped))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('customers', cust_count, 'invoices', inv_count, 'lines', line_count, 'skipped', skipped);
end; $$;

revoke all on function public.fm_sync(text, jsonb) from public;
grant execute on function public.fm_sync(text, jsonb) to anon, authenticated;

-- ===== join up the pairs already in ops =====
create or replace function public.dk_join_web_twins(p_apply boolean default false)
returns table (fm_job text, fm_no int, web_job text, customer text, postcode text, fm_date text, web_date text, goods numeric, done text)
language plpgsql security definer set search_path = public as $$
declare r record; t text; c text;
begin
  for r in
    select f.id as fid, f.inv_no, w.id as wid, cu.name as cname, public.dk_job_pc(f.site_id, f.customer_id) as pc, f.date as fdate, w.date as wdate,
           (select coalesce(sum(qty * price), 0) from public.invoice_items where invoice_id = f.id) as goods
      from public.invoices f
      join public.invoices w on w.id like 'web-i-%'
       and not exists (select 1 from public.fm_links k where k.kind = 'invoice' and k.ops_id = w.id)
       and w.date ~ '^\d{4}-\d{2}-\d{2}' and f.date ~ '^\d{4}-\d{2}-\d{2}' and abs(w.date::date - f.date::date) <= 21
       and public.dk_job_pc(w.site_id, w.customer_id) = public.dk_job_pc(f.site_id, f.customer_id)
       and public.dk_job_pc(f.site_id, f.customer_id) <> ''
       and abs((select coalesce(sum(qty * price), 0) from public.invoice_items where invoice_id = w.id)
             - (select coalesce(sum(qty * price), 0) from public.invoice_items where invoice_id = f.id)) < 1
      left join public.customers cu on cu.id = f.customer_id
     where f.id like 'fm-i-%' and (select coalesce(sum(qty * price), 0) from public.invoice_items where invoice_id = f.id) > 0
       and regexp_replace(coalesce(f.order_ref, ''), '\D', '', 'g') = ''
     order by f.date
  loop
    fm_job := r.fid; fm_no := r.inv_no; web_job := r.wid; customer := r.cname; postcode := r.pc;
    fm_date := r.fdate; web_date := r.wdate; goods := r.goods; done := 'preview';
    if p_apply then
      -- the website job takes FileMaker's details (its own lines stay until FileMaker sends again)
      update public.invoices w set
        inv_no = f.inv_no, customer_id = f.customer_id, site_id = case when f.site_id <> '' then f.site_id else w.site_id end,
        date = f.date, job_type = f.job_type, delivery_date = f.delivery_date, delivery_time = f.delivery_time,
        delivery_completed = w.delivery_completed or f.delivery_completed,
        payment_type = case when f.payment_type <> '' then f.payment_type else w.payment_type end,
        payment_date = case when f.payment_date <> '' then f.payment_date else w.payment_date end,
        delivery_charge = coalesce(f.delivery_charge, w.delivery_charge),
        job_notes = case when f.job_notes <> '' then f.job_notes else w.job_notes end,
        van = case when f.van <> '' then f.van else w.van end, driver = case when f.driver <> '' then f.driver else w.driver end,
        drop_no = case when f.drop_no <> '' then f.drop_no else w.drop_no end, run_no = case when f.run_no <> '' then f.run_no else w.run_no end,
        f_booked = w.f_booked or f.f_booked, f_courier = w.f_courier or f.f_courier, f_parts_ordered = w.f_parts_ordered or f.f_parts_ordered,
        f_parts_ready = w.f_parts_ready or f.f_parts_ready, f_review_requested = w.f_review_requested or f.f_review_requested,
        f_review_received = w.f_review_received or f.f_review_received, f_photos_requested = w.f_photos_requested or f.f_photos_requested,
        f_social_posted = w.f_social_posted or f.f_social_posted, f_sample_followed = w.f_sample_followed or f.f_sample_followed
      from public.invoices f where f.id = r.fid and w.id = r.wid;
      -- anything hung on the FileMaker copy moves to the website job
      foreach t in array array['invoice_picks.invoice_id', 'drop_confirmations.invoice_id', 'collection_items.assigned_invoice_id',
                               'collections.assigned_invoice_id', 'stock_movements.invoice_id', 'quotes.converted_invoice_id',
                               'samples.converted_invoice_id', 'email_log.invoice_id'] loop
        c := split_part(t, '.', 2); t := split_part(t, '.', 1);
        if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c) then
          execute format('update public.%I set %I = $1 where %I = $2', t, c, c) using r.wid, r.fid;
        end if;
      end loop;
      update public.fm_links set ops_id = r.wid where kind = 'invoice' and ops_id = r.fid;
      delete from public.invoices where id = r.fid;
      done := 'joined';
    end if;
    return next;
  end loop;
end; $$;
revoke all on function public.dk_join_web_twins(boolean) from public, anon;
grant execute on function public.dk_join_web_twins(boolean) to authenticated;

select * from public.dk_join_web_twins(false);
