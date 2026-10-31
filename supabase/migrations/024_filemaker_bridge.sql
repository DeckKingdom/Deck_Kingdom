-- Deck Kingdom Ops — FileMaker bridge (one-way: FileMaker -> ops), for running side by side.
-- A small program on the office PC reads new/changed customers and invoices from the
-- FileMaker file and sends them here through fm_sync(). FileMaker stays the master:
-- the bridge only writes the fields FileMaker owns, so anything staff add in ops
-- (delivery checklist ticks, picks, van, notes on the ops side) is left alone.
--
-- Records from FileMaker get ids "fm-c-<FileMaker id>" / "fm-i-<id>" / "fm-l-<invoice id>-<n>",
-- so re-sending the same record updates it instead of duplicating it.
-- A customer already in ops with the same account number is matched rather than duplicated.
--
-- The bridge proves itself with a shared secret stored in crm_settings ('fmBridge').
-- Set it once (the value comes with the bridge files, it is not kept in the code):
--   insert into public.crm_settings (key, value) values ('fmBridge', jsonb_build_object('secret', 'PASTE-SECRET'))
--   on conflict (key) do update set value = excluded.value;
-- Safe to re-run.

-- ===== field formatting, the same rules as typing into ops (FileMaker style) =====
-- Title Case for names and addresses (words already capitalised are left alone, single spaces),
-- phones 07951-728-742 / 0161-320-9664 (+44 becomes 0), postcodes OL6-6UG, emails lower case.
create or replace function public.dk_title(s text) returns text language plpgsql immutable as $$
declare w text; out text := '';
begin
  if s is null then return ''; end if;
  foreach w in array regexp_split_to_array(trim(s), '\s+') loop
    if w = '' then continue; end if;
    if w ~ '^[a-z]' then w := upper(left(w, 1)) || substr(w, 2); end if;
    out := out || case when out = '' then '' else ' ' end || w;
  end loop;
  return out;
end; $$;
create or replace function public.dk_phone(s text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(s, ''), '\D', '', 'g');
begin
  if d ~ '^44\d{10}$' then d := '0' || substr(d, 3); end if;
  if length(d) = 11 then
    if d like '07%' then return substr(d, 1, 5) || '-' || substr(d, 6, 3) || '-' || substr(d, 9); end if;
    return substr(d, 1, 4) || '-' || substr(d, 5, 3) || '-' || substr(d, 8);
  end if;
  return trim(coalesce(s, ''));
end; $$;
create or replace function public.dk_postcode(s text) returns text language plpgsql immutable as $$
declare c text := upper(regexp_replace(coalesce(s, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if length(c) between 5 and 7 then return left(c, length(c) - 3) || '-' || right(c, 3); end if;
  return upper(trim(coalesce(s, '')));
end; $$;

-- which ops record each FileMaker record became (a customer may be matched to one keyed in by hand)
create table if not exists public.fm_links (
  kind text not null,
  fm_id text not null,
  ops_id text not null,
  primary key (kind, fm_id)
);
alter table public.fm_links enable row level security;
drop policy if exists "staff read" on public.fm_links;
create policy "staff read" on public.fm_links for select to authenticated using (true);

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

    -- lines: FileMaker's list replaces the invoice's lines when it sends any
    if jsonb_array_length(coalesce(i -> 'lines', '[]'::jsonb)) > 0 then
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
