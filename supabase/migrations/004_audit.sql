-- Deck Kingdom Ops - audit trail
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Every insert/update/delete on the data tables is stamped (who + when, on
-- the row itself) and logged (field-level changes) by database triggers, so
-- the history is recorded server-side whatever the app does.

-- ===== stamp columns where missing =====
alter table public.products       add column if not exists created_by  text not null default '';
alter table public.products       add column if not exists modified_by text not null default '';
alter table public.shipments      add column if not exists created_by  text not null default '';
alter table public.shipments      add column if not exists modified_by text not null default '';
alter table public.customer_sites add column if not exists created_by  text not null default '';
alter table public.customer_sites add column if not exists modified_by text not null default '';
alter table public.invoices       add column if not exists created_by  text not null default '';
alter table public.invoices       add column if not exists modified_by text not null default '';
-- customers already has created_by / modified_by / updated_at

-- ===== the log =====
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,            -- created / updated / deleted
  table_name text not null,
  record_id text not null default '',
  changes jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (id desc);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;
drop policy if exists "staff read audit" on public.audit_log;
create policy "staff read audit" on public.audit_log
  for select to authenticated using (true);
-- no insert/update/delete policies: only the triggers below write to it

-- ===== who is making the change =====
create or replace function public.dk_actor()
returns text language sql stable as
$$ select coalesce(nullif(auth.jwt()->>'email',''), 'system') $$;

-- ===== stamp the row (runs first: a_ before b_) =====
create or replace function public.dk_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text := public.dk_actor();
begin
  if tg_op = 'INSERT' and coalesce(new.created_by, '') = '' then
    new.created_by := actor;
  end if;
  new.modified_by := actor;
  new.updated_at := now();
  return new;
end; $$;

-- ===== log the change =====
create or replace function public.dk_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text := public.dk_actor();
  skip constant text[] := array['updated_at','modified_by','created_by','position'];
  changes jsonb := '{}'::jsonb;
  rid text;
  k text;
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
    rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', '');
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

-- ===== wire the triggers =====
-- stamped tables (have created_by / modified_by / updated_at)
do $$
declare t text;
begin
  foreach t in array array['products','shipments','customers','customer_sites','invoices'] loop
    execute format('drop trigger if exists a_dk_stamp on public.%I', t);
    execute format('create trigger a_dk_stamp before insert or update on public.%I for each row execute function public.dk_stamp()', t);
  end loop;
  -- every data table gets the audit log
  foreach t in array array['products','shipments','shipment_lines','customers','customer_sites','invoices','invoice_items','crm_settings'] loop
    execute format('drop trigger if exists b_dk_audit on public.%I', t);
    execute format('create trigger b_dk_audit before insert or update or delete on public.%I for each row execute function public.dk_audit()', t);
  end loop;
end $$;
