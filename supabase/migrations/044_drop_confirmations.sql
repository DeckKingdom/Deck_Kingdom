-- Deck Kingdom Ops - drivers confirm each drop with a photo (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- On the driver's phone each stop unlocks only after the one before it has been confirmed:
-- the driver records what was dropped (or collected from a supplier) and takes a photo. The job
-- closes on the delivery schedule; anything left over or a driver's note pops up on the office
-- screens to dismiss or turn into a follow-up job.

create table if not exists public.drop_confirmations (
  id text primary key,
  at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  driver text not null default '',
  invoice_id text not null,
  inv_no text not null default '',
  delivery_date text not null default '',
  items jsonb not null default '[]'::jsonb,
  photo_path text not null default '',
  notes text not null default '',
  lat double precision,
  lng double precision,
  accuracy_m double precision
);
-- supplier pick-ups are confirmed the same way
alter table public.drop_confirmations add column if not exists kind text not null default 'job';
alter table public.drop_confirmations add column if not exists collection_id text not null default '';
alter table public.drop_confirmations alter column invoice_id set default '';
-- set once the office app has closed the job / pick-up from a full confirmation (so un-ticking it later sticks)
alter table public.drop_confirmations add column if not exists applied_at text not null default '';
-- part drops / driver notes raise an alert on the office screens until someone deals with it
alter table public.drop_confirmations add column if not exists alert_state text not null default '';   -- '' | open | dismissed | followup
alter table public.drop_confirmations add column if not exists alert_by text not null default '';
alter table public.drop_confirmations add column if not exists followup_inv_no text not null default '';
-- delivery issues stay live until someone marks them sorted (or the follow-up / payment sorts them)
alter table public.drop_confirmations add column if not exists resolved_at text not null default '';
alter table public.drop_confirmations add column if not exists resolved_by text not null default '';
alter table public.drop_confirmations add column if not exists resolution text not null default '';
alter table public.drop_confirmations add column if not exists supplier_emailed_at text not null default ''; -- short pick-up: supplier told
-- every photo the driver took (photo_path is the first)
alter table public.drop_confirmations add column if not exists photo_paths jsonb not null default '[]'::jsonb;
-- payment taken on the doorstep: { owed, collected, method }
alter table public.drop_confirmations add column if not exists payment jsonb not null default '{}'::jsonb;
create index if not exists drop_confirmations_invoice on public.drop_confirmations (invoice_id);
create index if not exists drop_confirmations_date on public.drop_confirmations (delivery_date);
alter table public.drop_confirmations enable row level security;
grant select, insert, update, delete on public.drop_confirmations to authenticated;

drop policy if exists "driver confirms" on public.drop_confirmations;
drop policy if exists "read drops" on public.drop_confirmations;
drop policy if exists "managers change drops" on public.drop_confirmations;
drop policy if exists "office marks applied" on public.drop_confirmations;
drop policy if exists "managers remove drops" on public.drop_confirmations;
-- a driver can only confirm a job that's planned for them
create policy "driver confirms" on public.drop_confirmations for insert to authenticated
  with check (user_id = auth.uid() and (
    public.dk_can_edit()
    or (public.dk_my_driver() <> '' and exists (select 1 from public.invoices i where i.id = invoice_id and lower(i.driver) = lower(public.dk_my_driver())))
    or (public.dk_my_driver() <> '' and exists (select 1 from public.collections c where c.id = collection_id and lower(c.driver) = lower(public.dk_my_driver())))
  ));
create policy "read drops" on public.drop_confirmations for select to authenticated
  using (public.dk_is_staff() or user_id = auth.uid()
    or (public.dk_my_driver() <> '' and exists (select 1 from public.invoices i where i.id = invoice_id and lower(i.driver) = lower(public.dk_my_driver())))
    or (public.dk_my_driver() <> '' and exists (select 1 from public.collections c where c.id = collection_id and lower(c.driver) = lower(public.dk_my_driver()))));
create policy "managers change drops" on public.drop_confirmations for update to authenticated using (public.dk_can_manage()) with check (public.dk_can_manage());
create policy "office marks applied" on public.drop_confirmations for update to authenticated using (public.dk_can_edit()) with check (public.dk_can_edit());
create policy "managers remove drops" on public.drop_confirmations for delete to authenticated using (public.dk_can_manage());

-- drop photos: private; drivers add to their own folder, office staff can view
insert into storage.buckets (id, name, public) values ('drop-photos', 'drop-photos', false) on conflict (id) do nothing;
drop policy if exists "drop photos add" on storage.objects;
drop policy if exists "drop photos read" on storage.objects;
create policy "drop photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'drop-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "drop photos read" on storage.objects for select to authenticated
  using (bucket_id = 'drop-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.dk_is_staff()));

select count(*) as drop_confirmations from public.drop_confirmations;
