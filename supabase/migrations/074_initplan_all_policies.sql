-- Deck Kingdom Ops — the Tuesday timeout fix, applied everywhere (27 Nov 2026).
-- Policies from 037/043/044/…/059 call dk_is_staff() / dk_can_edit() /
-- dk_can_manage() / dk_is_admin() / dk_my_driver() / auth.uid() bare, so
-- Postgres re-evaluates them for EVERY ROW read. The login has grown (130k
-- invoice lines, 4,900 ledger rows) to where that trips the statement timeout.
-- This rewrites every such policy with the calls wrapped as (select fn()) —
-- evaluated once per statement as an InitPlan — exactly what 070 did for the
-- loading tables. Mechanical rewrite: names, commands, roles stay the same.
-- Safe to re-run; already-wrapped policies are left alone.
do $$
declare p record; q text; c text; parts text;
begin
  for p in
    select * from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(dk_(is_staff|can_edit|can_manage|is_admin|my_driver)|auth\.uid)\(\)'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'SELECT (public\.)?(dk_|auth\.uid)'
  loop
    q := regexp_replace(p.qual, '(public\.)?(dk_(?:is_staff|can_edit|can_manage|is_admin|my_driver))\(\)', '(select public.\2())', 'g');
    q := regexp_replace(q, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(p.with_check, '(public\.)?(dk_(?:is_staff|can_edit|can_manage|is_admin|my_driver))\(\)', '(select public.\2())', 'g');
    c := regexp_replace(c, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    parts := coalesce('using (' || q || ')', '') || coalesce(' with check (' || c || ')', '');
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s %s',
      p.policyname, p.tablename, lower(p.permissive), lower(p.cmd),
      array_to_string(p.roles, ', '), parts);
    raise notice 'rewrote % on %', p.policyname, p.tablename;
  end loop;
end $$;

-- anything this list still shows calls the helpers per row (should be empty,
-- bar the loading tables' dk_driver_is(colour-arg) checks which can't initplan)
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'dk_(is_staff|can_edit|can_manage|is_admin|my_driver)\(\)'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'SELECT (public\.)?dk_'
order by tablename, policyname;
