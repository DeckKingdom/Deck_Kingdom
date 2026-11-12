-- Deck Kingdom Ops — one person in a record at a time.
-- A row here means "this record is open for editing by actor"; the editor's
-- browser refreshes it every 20 seconds and deletes it on leaving. Anything
-- older than 45 seconds counts as stale and is ignored, so a crashed tab or
-- closed laptop can never lock a job for good. No audit trigger on purpose:
-- heartbeats must not look like data changes. Safe to re-run.
create table if not exists public.record_locks (
  id text primary key,
  actor text not null default '',
  at timestamptz not null default now()
);
alter table public.record_locks enable row level security;
drop policy if exists "locks all access" on public.record_locks;
create policy "locks all access" on public.record_locks for all to authenticated using (true) with check (true);
