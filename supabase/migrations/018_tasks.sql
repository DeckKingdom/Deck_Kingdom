-- Deck Kingdom Ops - staff tasks: daily to-do lists, spare-time projects and
-- scheduled (weekly / monthly rota) tasks, plus the log of what was ticked off.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Nothing destructive: it only adds two tables.
--
-- Staff names: the ops app shows profiles.full_name where it's set (Table
-- Editor -> profiles), otherwise the first part of the login email.

create table if not exists public.tasks (
  id text primary key,
  kind text not null default 'daily',        -- daily / project / scheduled
  title text not null default '',
  notes text not null default '',
  assignees text not null default '',        -- comma-separated login emails; blank = everyone
  rotate boolean not null default false,     -- scheduled: take turns down the list
  repeat text not null default 'workdays',   -- daily: workdays / everyday / once
  on_date text not null default '',          -- daily 'once': the day it shows
  frequency text not null default 'weekly',  -- scheduled: weekly / fortnightly / monthly
  weekday integer not null default 0,        -- 0 = Monday
  month_day integer not null default 1,
  start_date text not null default '',
  status text not null default 'To do',      -- project: To do / In progress / Done
  priority text not null default 'Normal',
  due_date text not null default '',
  active boolean not null default true,
  created text not null default '',
  created_by text not null default '',
  modified_by text not null default '',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.task_log (
  id text primary key,
  task_id text not null references public.tasks(id) on delete cascade,
  period text not null default '',           -- the day (daily) or occurrence date (scheduled)
  done_by text not null default '',
  done_at text not null default '',
  position integer not null default 0
);
create index if not exists task_log_task_idx on public.task_log (task_id);
create index if not exists task_log_period_idx on public.task_log (period);

alter table public.tasks enable row level security;
alter table public.task_log enable row level security;
drop policy if exists "staff full access" on public.tasks;
create policy "staff full access" on public.tasks
  for all to authenticated using (true) with check (true);
drop policy if exists "staff full access" on public.task_log;
create policy "staff full access" on public.task_log
  for all to authenticated using (true) with check (true);

drop trigger if exists a_dk_stamp on public.tasks;
create trigger a_dk_stamp before insert or update on public.tasks
  for each row execute function public.dk_stamp();
drop trigger if exists b_dk_audit on public.tasks;
create trigger b_dk_audit before insert or update or delete on public.tasks
  for each row execute function public.dk_audit();
-- task_log is deliberately not audited: it IS the record of who ticked what
