-- Deck Kingdom Ops - adding tasks from the phone app (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Driver logins can add a task for themselves (and anyone else - a joint task), mark their jobs done,
-- and see staff names so they can pick who it's for. Warehouse logins already can (staff).

drop policy if exists "driver add task" on public.tasks;
create policy "driver add task" on public.tasks for insert to authenticated
  with check (public.dk_my_driver() <> ''
    and lower(created_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and position(lower(coalesce(auth.jwt() ->> 'email', '')) in lower(assignees)) > 0);

drop policy if exists "driver update own task" on public.tasks;
create policy "driver update own task" on public.tasks for update to authenticated
  using (public.dk_my_driver() <> '' and position(lower(coalesce(auth.jwt() ->> 'email', '')) in lower(assignees)) > 0)
  with check (public.dk_my_driver() <> '' and position(lower(coalesce(auth.jwt() ->> 'email', '')) in lower(assignees)) > 0);

-- who's who, for picking people on a task
drop policy if exists "driver read staff" on public.profiles;
create policy "driver read staff" on public.profiles for select to authenticated using (public.dk_my_driver() <> '');

select count(*) as tasks from public.tasks;
