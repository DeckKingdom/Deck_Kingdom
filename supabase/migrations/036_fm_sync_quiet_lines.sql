-- Deck Kingdom Ops - FileMaker bridge, faster sync (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- The bridge now runs every minute, so resending must be quiet:
--  1. the activity log no longer records a "created" entry when a save or resend hits a row that
--     already exists (it's really an update, and the update is logged - only if something changed)
--  2. a resent invoice only has its lines replaced when they've actually changed
-- The ops app watches the activity log to show changes live, so this keeps it from reloading for nothing.

create or replace function public.dk_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text := public.dk_actor();
  skip constant text[] := array['updated_at','modified_by','created_by','position'];
  changes jsonb := '{}'::jsonb;
  rid text;
  k text;
  pk text;
  ex boolean := false;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if not (k = any(skip)) and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        changes := changes || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
      end if;
    end loop;
    if changes = '{}'::jsonb then return new; end if;  -- nothing meaningful changed
    rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', '');
    insert into public.audit_log (actor, action, table_name, record_id, changes)
      values (actor, 'updated', tg_table_name, rid, changes);
    return new;
  elsif tg_op = 'INSERT' then
    pk := case when to_jsonb(new) ? 'id' then 'id' when to_jsonb(new) ? 'key' then 'key' end;
    rid := coalesce(to_jsonb(new) ->> pk, '');
    -- an upsert of a row that's already there turns into an update, which logs itself
    if pk is not null then
      execute format('select exists (select 1 from %I.%I where %I::text = $1)', tg_table_schema, tg_table_name, pk) into ex using rid;
      if ex then return new; end if;
    end if;
    insert into public.audit_log (actor, action, table_name, record_id, changes)
      values (actor, 'created', tg_table_name, rid, to_jsonb(new) - skip);
    return new;
  else
    rid := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', '');
    insert into public.audit_log (actor, action, table_name, record_id, changes)
      values (actor, 'deleted', tg_table_name, rid, to_jsonb(old) - skip);
    return old;
  end if;
end; $$;


create or replace function public.fm_sync(p_secret text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  want text := (select value ->> 'secret' from public.crm_settings where key = 'fmBridge');
  c jsonb; i jsonb; l jsonb; st jsonb;
  cid text; iid text; sid text; n int;
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
    insert into public.invoices as t (id, inv_no, customer_id, site_id, date, order_ref, job_type, van, delivery_date, delivery_time, delivery_completed,
                                      payment_type, payment_date, delivery_charge, job_notes, raised_by, created, created_by,
                                      f_booked, f_courier, f_parts_ordered, f_parts_ready, f_review_requested, f_review_received,
                                      f_photos_requested, f_social_posted, f_sample_followed)
    values (iid, case when coalesce(i ->> 'invNo', '') ~ '^\d{1,9}$' then (i ->> 'invNo')::int end, cid, coalesce(sid, ''),
            coalesce(i ->> 'date', ''), coalesce(i ->> 'orderRef', ''),
            coalesce(nullif(i ->> 'jobType', ''), 'Delivery Run 1'), coalesce(i ->> 'van', ''), coalesce(i ->> 'deliveryDate', ''), coalesce(i ->> 'deliveryTime', ''),
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
      van = case when excluded.van <> '' then excluded.van else t.van end,
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
