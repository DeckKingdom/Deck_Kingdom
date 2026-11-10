-- Deck Kingdom Ops - tasks on the drivers' phones (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Driver logins can see the tasks set for them (or for everyone) and tick them off. Everything else
-- about tasks stays with the office.

drop policy if exists "driver read tasks" on public.tasks;
create policy "driver read tasks" on public.tasks for select to authenticated
  using (public.dk_my_driver() <> '' and (trim(assignees) = '' or position(lower(coalesce(auth.jwt() ->> 'email', '')) in lower(assignees)) > 0));

drop policy if exists "driver read ticks" on public.task_log;
drop policy if exists "driver tick" on public.task_log;
drop policy if exists "driver untick" on public.task_log;
create policy "driver read ticks" on public.task_log for select to authenticated using (public.dk_my_driver() <> '');
create policy "driver tick" on public.task_log for insert to authenticated
  with check (public.dk_my_driver() <> '' and lower(done_by) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "driver untick" on public.task_log for delete to authenticated
  using (public.dk_my_driver() <> '' and lower(done_by) = lower(coalesce(auth.jwt() ->> 'email', '')));

select count(*) as tasks from public.tasks;
