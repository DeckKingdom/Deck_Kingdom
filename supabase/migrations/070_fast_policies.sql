-- Deck Kingdom Ops — URGENT fix for "canceling statement due to statement timeout" (24 Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- 069 widened access with policies like `using (public.dk_my_driver() <> '')`.
-- Those helper functions are security definer, so Postgres can't optimise them
-- and runs the users-table lookup for EVERY ROW scanned — hundreds of
-- thousands of lookups on a full load, which blows the statement timeout and
-- stops the phones loading. Wrapping each call as `(select fn())` makes
-- Postgres evaluate it ONCE per query (an initplan) — same rules, same
-- answers, a fraction of the cost.

do $$ declare t text; begin
  foreach t in array array['load_reports', 'load_lines'] loop
    execute format('drop policy if exists "read loading" on public.%I', t);
    execute format('drop policy if exists "add loading" on public.%I', t);
    execute format('drop policy if exists "change loading" on public.%I', t);
    execute format('create policy "read loading" on public.%I for select to authenticated using ((select public.dk_is_staff()) or (select public.dk_my_driver()) <> '''')', t);
    execute format('create policy "add loading" on public.%I for insert to authenticated with check ((select public.dk_can_edit()) or (select public.dk_my_driver()) <> '''')', t);
    execute format('create policy "change loading" on public.%I for update to authenticated using ((select public.dk_can_edit()) or (select public.dk_my_driver()) <> '''') with check ((select public.dk_can_edit()) or (select public.dk_my_driver()) <> '''')', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['invoices', 'invoice_items', 'customers', 'customer_sites', 'collections', 'collection_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "driver read" on public.%I', t);
      execute format('create policy "driver read" on public.%I for select to authenticated using ((select public.dk_my_driver()) <> '''')', t);
    end if;
  end loop;
end $$;
