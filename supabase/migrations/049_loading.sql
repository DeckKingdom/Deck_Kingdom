-- Deck Kingdom Ops - loading the vans (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Whoever loads a van counts every line on (part loads allowed, any order), photographs the van and
-- submits the loading report. A DIFFERENT person (another loader, the office - or the driver) then
-- double-checks the van and confirms it; only then do the driver's deliveries open. A van can go
-- out short with a reason - the office gets a short-load alert. Drivers only see their own runs.

create or replace function public.dk_driver_is(p_driver text) returns boolean language sql stable security definer set search_path = public as
$$ select public.dk_my_driver() <> '' and lower(trim(p_driver)) = lower(public.dk_my_driver()) $$;

create table if not exists public.load_reports (
  id text primary key,                 -- run date | driver | run number
  run_date text not null,
  driver text not null default '',
  run_no text not null default '',
  van text not null default '',
  status text not null default 'open', -- open | submitted (loaded, waiting for a second person) | complete (double-checked)
  completed_at text not null default '',
  completed_by text not null default '',
  checked jsonb not null default '[]'::jsonb,     -- the double-check: every line re-ticked at close
  photo_paths jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists load_reports_date on public.load_reports (run_date);
-- closed with items missing: what's short, and the office's follow-up (like a delivery issue)
alter table public.load_reports add column if not exists short_lines jsonb not null default '[]'::jsonb;
alter table public.load_reports add column if not exists alert_state text not null default '';  -- '' | open | dismissed
alter table public.load_reports add column if not exists resolved_at text not null default '';
alter table public.load_reports add column if not exists resolved_by text not null default '';
alter table public.load_reports add column if not exists resolution text not null default '';
alter table public.load_reports add column if not exists followups jsonb not null default '{}'::jsonb; -- job id -> follow-up job no.
-- the second person's double-check (completed_* = whoever loaded and submitted it)
alter table public.load_reports add column if not exists checked_by text not null default '';
alter table public.load_reports add column if not exists checked_at text not null default '';
alter table public.load_reports add column if not exists sent_back text not null default ''; -- why the checker sent it back

create table if not exists public.load_lines (
  report_id text not null,
  item_key text not null,              -- job id : line number
  run_date text not null default '',
  driver text not null default '',
  qty_needed numeric,
  qty_loaded numeric not null default 0,
  loaded_by text not null default '',
  loaded_at timestamptz not null default now(),
  primary key (report_id, item_key)
);
-- accessories packed in a box rather than counted loose; "boxes:<job id>" rows hold the box count
alter table public.load_lines add column if not exists boxed boolean not null default false;
create index if not exists load_lines_date on public.load_lines (run_date);

alter table public.load_reports enable row level security;
alter table public.load_lines enable row level security;
grant select, insert, update, delete on public.load_reports, public.load_lines to authenticated;

do $$ declare t text; begin
  foreach t in array array['load_reports', 'load_lines'] loop
    execute format('drop policy if exists "read loading" on public.%I', t);
    execute format('drop policy if exists "add loading" on public.%I', t);
    execute format('drop policy if exists "change loading" on public.%I', t);
    execute format('drop policy if exists "remove loading" on public.%I', t);
    execute format('create policy "read loading" on public.%I for select to authenticated using (public.dk_is_staff() or public.dk_driver_is(driver))', t);
    execute format('create policy "add loading" on public.%I for insert to authenticated with check (public.dk_can_edit() or public.dk_driver_is(driver))', t);
    execute format('create policy "change loading" on public.%I for update to authenticated using (public.dk_can_edit() or public.dk_driver_is(driver)) with check (public.dk_can_edit() or public.dk_driver_is(driver))', t);
    execute format('create policy "remove loading" on public.%I for delete to authenticated using (public.dk_can_manage())', t);
  end loop;
end $$;

-- photos of the loaded van
insert into storage.buckets (id, name, public) values ('load-photos', 'load-photos', false) on conflict (id) do nothing;
drop policy if exists "load photos add" on storage.objects;
drop policy if exists "load photos read" on storage.objects;
drop policy if exists "load photos admin remove" on storage.objects;
create policy "load photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'load-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "load photos read" on storage.objects for select to authenticated
  using (bucket_id = 'load-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.dk_is_staff()));
create policy "load photos admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'load-photos' and public.dk_is_admin());

select count(*) as load_reports from public.load_reports;
