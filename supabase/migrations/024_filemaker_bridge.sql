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
  c jsonb; i jsonb; l jsonb;
  cid text; iid text; n int;
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
      if nullif(c ->> 'accountNo', '') is not null then
        select id into cid from public.customers where account_no = (c ->> 'accountNo')::int order by (id like 'fm-c-%') limit 1;
      end if;
      cid := coalesce(cid, 'fm-c-' || (c ->> 'fmId'));
      insert into public.fm_links (kind, fm_id, ops_id) values ('customer', c ->> 'fmId', cid) on conflict do nothing;
    end if;
    insert into public.customers as t (id, account_no, name, address, town, postcode, contact, landline, mobile, email, source, trader, created, created_by)
    values (cid, nullif(c ->> 'accountNo', '')::int, coalesce(c ->> 'name', ''), coalesce(c ->> 'address', ''), coalesce(c ->> 'town', ''),
            coalesce(c ->> 'postcode', ''), coalesce(c ->> 'contact', ''), coalesce(c ->> 'landline', ''), coalesce(c ->> 'mobile', ''),
            coalesce(c ->> 'email', ''), coalesce(c ->> 'source', ''), coalesce((c ->> 'trader')::boolean, false), coalesce(c ->> 'created', ''), 'FileMaker')
    on conflict (id) do update set
      account_no = excluded.account_no, name = excluded.name, address = excluded.address, town = excluded.town,
      postcode = excluded.postcode, contact = excluded.contact, landline = excluded.landline, mobile = excluded.mobile,
      email = excluded.email, source = excluded.source, trader = excluded.trader,
      created = case when t.created = '' then excluded.created else t.created end;
    cust_count := cust_count + 1;
  end loop;

  -- ===== invoices + their lines =====
  for i in select * from jsonb_array_elements(coalesce(p_payload -> 'invoices', '[]'::jsonb)) loop
    iid := 'fm-i-' || (i ->> 'fmId');
    -- the invoice's customer: by FileMaker id, else by account number
    cid := (select ops_id from public.fm_links where kind = 'customer' and fm_id = i ->> 'customerFmId');
    if cid is null then select id into cid from public.customers where id = 'fm-c-' || (i ->> 'customerFmId'); end if;
    if cid is null and nullif(i ->> 'accountNo', '') is not null then
      select id into cid from public.customers where account_no = (i ->> 'accountNo')::int limit 1;
    end if;
    if cid is null then
      skipped := skipped || jsonb_build_object('invoice', i ->> 'invNo', 'reason', 'customer not found');
      continue;
    end if;
    insert into public.invoices as t (id, inv_no, customer_id, date, order_ref, job_type, delivery_date, delivery_time, delivery_completed,
                                      payment_type, payment_date, delivery_charge, job_notes, raised_by, created, created_by)
    values (iid, nullif(i ->> 'invNo', '')::int, cid, coalesce(i ->> 'date', ''), coalesce(i ->> 'orderRef', ''),
            coalesce(nullif(i ->> 'jobType', ''), 'Delivery 1'), coalesce(i ->> 'deliveryDate', ''), coalesce(i ->> 'deliveryTime', ''),
            coalesce((i ->> 'deliveryCompleted')::boolean, false), coalesce(i ->> 'paymentType', ''), coalesce(i ->> 'paymentDate', ''),
            nullif(i ->> 'deliveryCharge', '')::numeric, coalesce(i ->> 'jobNotes', ''), coalesce(i ->> 'raisedBy', ''),
            coalesce(i ->> 'created', ''), 'FileMaker')
    on conflict (id) do update set
      inv_no = excluded.inv_no, customer_id = excluded.customer_id, date = excluded.date, order_ref = excluded.order_ref,
      job_type = excluded.job_type, delivery_date = excluded.delivery_date, delivery_time = excluded.delivery_time,
      -- once ticked as delivered in either system it stays delivered
      delivery_completed = t.delivery_completed or excluded.delivery_completed,
      payment_type = excluded.payment_type, payment_date = excluded.payment_date, delivery_charge = excluded.delivery_charge,
      job_notes = excluded.job_notes, raised_by = excluded.raised_by;
    inv_count := inv_count + 1;

    -- lines: FileMaker's list replaces the invoice's lines when it sends any
    if jsonb_array_length(coalesce(i -> 'lines', '[]'::jsonb)) > 0 then
      delete from public.invoice_items where invoice_id = iid and id like 'fm-l-%';
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
