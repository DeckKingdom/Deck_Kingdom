-- 058: account numbers for every account, and duplicate accounts merged.
--
--  1. dk_customer_dupes(false)  -> PREVIEW the duplicate accounts (nothing changes)
--     dk_customer_dupes(true)   -> merge them: each group goes into the account with the most jobs
--  2. dk_number_new_accounts(false) -> PREVIEW the numbers the "NEW" accounts will get
--     dk_number_new_accounts(true)  -> give them out, filling spare (unused) numbers first
--  3. From now on an account arriving without a number (the website) gets the lowest spare number
--     straight away, and two accounts can never share a number.
--
-- Run the merge BEFORE the numbering: merged-away accounts free their numbers up for re-use.
-- Every merged-away account is kept in full in the audit log, so any merge can be undone by hand.

-- ===== website emails of merged-away accounts keep finding the account they were merged into =====
create table if not exists public.customer_aliases (
  email text primary key,          -- lower case
  customer_id text not null,
  merged_from text not null default '',
  merged_at timestamptz not null default now()
);
alter table public.customer_aliases enable row level security;
drop policy if exists customer_aliases_read on public.customer_aliases;
create policy customer_aliases_read on public.customer_aliases for select to authenticated using (public.dk_is_staff());

-- web_customer (025) + a look in the aliases first
create or replace function public.web_customer(c jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(c ->> 'email', '')));
  cid text;
  nm text := public.dk_title(coalesce(nullif(trim(c ->> 'company'), ''), trim(coalesce(c ->> 'first', '') || ' ' || coalesce(c ->> 'last', ''))));
  v_phone text := public.dk_phone(c ->> 'phone');
  addr text := public.dk_title(trim(both ', ' from coalesce(c ->> 'address1', '') || ', ' || coalesce(c ->> 'address2', '')));
  v_town text := public.dk_title(c ->> 'city');
  pc text := public.dk_postcode(c ->> 'postcode');
begin
  if v_email = '' then return null; end if;
  select id into cid from public.customers where lower(customers.email) = v_email order by (account_no is not null) desc, updated_at desc limit 1;
  if cid is null then
    select a.customer_id into cid from public.customer_aliases a join public.customers k on k.id = a.customer_id where a.email = v_email;
  end if;
  if cid is null then
    cid := 'web-c-' || md5(v_email);
    insert into public.customers (id, name, address, town, postcode, contact, landline, mobile, email, source, created, created_by)
    values (cid, nm, addr, v_town, pc,
            case when nullif(trim(c ->> 'company'), '') is not null then public.dk_title(trim(coalesce(c ->> 'first', '') || ' ' || coalesce(c ->> 'last', ''))) else '' end,
            case when v_phone ~ '^\s*(\+44\s*7|07)' then '' else v_phone end,
            case when v_phone ~ '^\s*(\+44\s*7|07)' then v_phone else '' end,
            v_email, 'Website', to_char(now(), 'YYYY-MM-DD'), 'Website')
    on conflict (id) do nothing;
  else
    update public.customers set
      name = case when name = '' then nm else name end,
      address = case when address = '' then addr else address end,
      town = case when town = '' then v_town else town end,
      postcode = case when postcode = '' then pc else postcode end,
      mobile = case when mobile = '' and landline = '' and v_phone ~ '^\s*(\+44\s*7|07)' then v_phone else mobile end,
      landline = case when landline = '' and mobile = '' and v_phone !~ '^\s*(\+44\s*7|07)' then v_phone else landline end
    where id = cid and (name = '' or address = '' or town = '' or postcode = '' or (mobile = '' and landline = ''));
  end if;
  return cid;
end; $$;
revoke all on function public.web_customer(jsonb) from public;

-- ===== the lowest account number nobody is using =====
create or replace function public.dk_spare_account_no(p_except text default '')
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select min(n) from generate_series(1, coalesce((select max(account_no) from public.customers), 0)) n
      where not exists (select 1 from public.customers where account_no = n and id <> p_except)),
    coalesce((select max(account_no) from public.customers), 0) + 1)
$$;

-- ===== every account gets a number, never a shared one =====
create or replace function public.dk_acct_no_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare cur int; had boolean;
begin
  perform pg_advisory_xact_lock(5800058);
  select account_no into cur from public.customers where id = new.id;
  had := found;
  -- a screen that loaded the account before it had a number must not wipe the number out
  if new.account_no is null and had and cur is not null then new.account_no := cur; end if;
  if new.account_no is null then
    new.account_no := public.dk_spare_account_no(new.id);
    return new;
  end if;
  if had and cur is not distinct from new.account_no then return new; end if;
  if exists (select 1 from public.customers where account_no = new.account_no and id <> new.id) then
    if had and cur is not null and not exists (select 1 from public.customers where account_no = cur and id <> new.id) then
      new.account_no := cur;
    else
      new.account_no := public.dk_spare_account_no(new.id);
    end if;
  end if;
  return new;
end; $$;
-- (not switched on until the numbering below has been run - see the end of the file)

-- ===== duplicates =====
-- Same account if they share: an email address, a phone number, or the same name at the same postcode.
-- Emails / phones on more than 4 accounts are treated as placeholders (the shop's own, "none", etc.) and ignored.
create or replace function public.dk_customer_dupes(p_apply boolean default false)
returns table (grp int, keep_no int, keep_name text, keep_jobs int, merge_no int, merge_name text, merge_postcode text, merge_jobs int, matched_on text, done text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  r record; t text; c text; ks record;
begin
  drop table if exists pg_temp.dk_k; drop table if exists pg_temp.dk_comp; drop table if exists pg_temp.dk_plan;
  create temp table dk_k (id text, key text, label text);
  insert into dk_k
    select id, 'e:' || lower(trim(email)), lower(trim(email)) from public.customers
     where email ~ '@' and lower(email) !~ 'deckkingdom'
    union all
    select id, 'p:' || p, p from (
      select id, regexp_replace(regexp_replace(ph, '\D', '', 'g'), '^44', '0') as p
        from public.customers, unnest(array[mobile, landline]) ph) x
     where length(p) >= 10 and p <> '01613991837' and p !~ '^0+$'
    union all
    select id, 'n:' || lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) || '|' || upper(regexp_replace(postcode, '[^A-Za-z0-9]', '', 'g')),
           name || ' at ' || postcode
      from public.customers
     where length(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) >= 3 and length(regexp_replace(postcode, '[^A-Za-z0-9]', '', 'g')) >= 5;
  delete from dk_k where key in (select key from dk_k group by key having count(distinct id) > 4 or count(distinct id) < 2);

  -- join up everything connected through any shared key
  create temp table dk_comp as select distinct id, id as c from dk_k;
  loop
    update dk_comp set c = s.m
      from (select k1.id, min(c2.c) as m from dk_k k1 join dk_k k2 on k2.key = k1.key join dk_comp c2 on c2.id = k2.id group by k1.id) s
     where dk_comp.id = s.id and s.m < dk_comp.c;
    exit when not found;
  end loop;

  create temp table dk_plan as
    with j as (select customer_id, count(*)::int as n from public.invoices group by customer_id),
    m as (
      select dc.c, cu.id, cu.account_no, cu.name, cu.postcode, coalesce(j.n, 0) as jobs,
             row_number() over (partition by dc.c order by coalesce(j.n, 0) desc, (cu.account_no is not null) desc, cu.account_no, cu.created, cu.id) as rk
        from dk_comp dc join public.customers cu on cu.id = dc.id left join j on j.customer_id = cu.id)
    select dense_rank() over (order by k.account_no nulls last, k.c)::int as grp,
           k.id as keep_id, k.account_no as keep_no, k.name as keep_name, k.jobs as keep_jobs,
           d.id as merge_id, d.account_no as merge_no, d.name as merge_name, d.postcode as merge_postcode, d.jobs as merge_jobs,
           (select string_agg(distinct x.label, ' · ') from dk_k x join dk_k y on y.key = x.key and y.id <> x.id join dk_comp z on z.id = y.id and z.c = d.c where x.id = d.id) as matched_on
      from m k join m d on d.c = k.c and d.rk > 1
     where k.rk = 1;

  for r in select * from dk_plan p order by p.grp, p.merge_no nulls last, p.merge_jobs desc loop
    grp := r.grp; keep_no := r.keep_no; keep_name := r.keep_name; keep_jobs := r.keep_jobs;
    merge_no := r.merge_no; merge_name := r.merge_name; merge_postcode := r.merge_postcode; merge_jobs := r.merge_jobs;
    matched_on := r.matched_on; done := 'preview';
    if p_apply then
      -- sites: one the keeper already has (same postcode + first line) is joined up, the rest move across
      for ks in select s.id as sid,
                       (select k.id from public.customer_sites k where k.customer_id = r.keep_id
                           and regexp_replace(s.postcode, '[^A-Za-z0-9]', '', 'g') <> ''
                           and upper(regexp_replace(k.postcode, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(s.postcode, '[^A-Za-z0-9]', '', 'g'))
                           and lower(regexp_replace(split_part(k.address, ',', 1), '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(split_part(s.address, ',', 1), '[^A-Za-z0-9]', '', 'g'))
                         limit 1) as kid
                  from public.customer_sites s where s.customer_id = r.merge_id loop
        if ks.kid is not null then
          for t, c in select table_name, column_name from information_schema.columns
                      where table_schema = 'public' and column_name = 'site_id' and table_name <> 'customer_sites' loop
            execute format('update public.%I set %I = $1 where %I = $2', t, c, c) using ks.kid, ks.sid;
          end loop;
          delete from public.customer_sites where id = ks.sid;
        end if;
      end loop;
      -- everything else that points at the account (jobs, sites, quotes, samples, emails, tasks...) moves to the keeper
      for t, c in select table_name, column_name from information_schema.columns col
                  where col.table_schema = 'public' and col.column_name = 'customer_id' and col.table_name not in ('customers', 'customer_aliases')
                    and exists (select 1 from information_schema.tables tb where tb.table_schema = 'public' and tb.table_name = col.table_name and tb.table_type = 'BASE TABLE') loop
        execute format('update public.%I set %I = $1 where %I = $2', t, c, c) using r.keep_id, r.merge_id;
      end loop;
      update public.fm_links set ops_id = r.keep_id where kind = 'customer' and ops_id = r.merge_id;
      update public.customer_aliases set customer_id = r.keep_id where customer_id = r.merge_id;
      -- the keeper takes any details it's missing
      update public.customers k set
        email = case when k.email = '' then d.email else k.email end,
        mobile = case when k.mobile = '' then d.mobile else k.mobile end,
        landline = case when k.landline = '' then d.landline else k.landline end,
        address = case when k.address = '' then d.address else k.address end,
        town = case when k.town = '' then d.town else k.town end,
        postcode = case when k.postcode = '' then d.postcode else k.postcode end,
        contact = case when k.contact = '' then d.contact else k.contact end,
        source = case when k.source = '' then d.source else k.source end,
        trader = k.trader or d.trader
      from public.customers d where k.id = r.keep_id and d.id = r.merge_id;
      -- the website keeps finding the keeper by the merged account's email
      insert into public.customer_aliases (email, customer_id, merged_from)
        select lower(trim(email)), r.keep_id, r.merge_id from public.customers
         where id = r.merge_id and email ~ '@' and lower(trim(email)) <> (select lower(trim(email)) from public.customers where id = r.keep_id)
      on conflict (email) do update set customer_id = excluded.customer_id, merged_from = excluded.merged_from, merged_at = now();
      delete from public.customers where id = r.merge_id;
      done := 'merged';
      -- a kept account with no number yet takes the merged one's (the oldest number in the group)
      if r.merge_no is not null and exists (select 1 from public.customers where id = r.keep_id and account_no is null) then
        update public.customers set account_no = r.merge_no where id = r.keep_id;
        done := 'merged · keeps #' || r.merge_no;
      end if;
    end if;
    return next;
  end loop;
end; $$;
revoke all on function public.dk_customer_dupes(boolean) from public, anon;
grant execute on function public.dk_customer_dupes(boolean) to authenticated;

-- ===== numbers for the "NEW" accounts: spare numbers first (oldest account gets the lowest) =====
create or replace function public.dk_number_new_accounts(p_apply boolean default false)
returns table (account_no int, name text, postcode text, created text, done text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; spares int[]; top int; i int := 1; n int;
begin
  perform pg_advisory_xact_lock(5800058);
  top := coalesce((select max(c.account_no) from public.customers c), 0);
  select coalesce(array_agg(g order by g), '{}') into spares from generate_series(1, top) g
   where not exists (select 1 from public.customers c where c.account_no = g);
  for r in select cu.id, cu.name, cu.postcode, cu.created from public.customers cu where cu.account_no is null order by cu.created, cu.id loop
    if i <= coalesce(array_length(spares, 1), 0) then n := spares[i]; i := i + 1;
    else top := top + 1; n := top; end if;
    account_no := n; name := r.name; postcode := r.postcode; created := r.created; done := 'preview';
    if p_apply then
      update public.customers set account_no = n where id = r.id;
      done := 'numbered';
    end if;
    return next;
  end loop;
  if p_apply then
    update public.crm_settings set value = jsonb_set(value, '{account}', to_jsonb(coalesce((select max(c.account_no) from public.customers c), 0) + 1))
     where key = 'numbering';
    -- from now on every account gets a number as it arrives
    drop trigger if exists aa_acct_no_guard on public.customers;
    create trigger aa_acct_no_guard before insert or update of account_no on public.customers
      for each row execute function public.dk_acct_no_guard();
  end if;
end; $$;
revoke all on function public.dk_number_new_accounts(boolean) from public, anon;
grant execute on function public.dk_number_new_accounts(boolean) to authenticated;

-- STEP 1 - look at this list first. Each group: the account kept (most jobs) and the account(s) merged into it.
select * from public.dk_customer_dupes(false);
