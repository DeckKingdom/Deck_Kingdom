-- Deck Kingdom Ops — loading for everyone, one loader at a time (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- 1. Every driver can see and work EVERY van's loading, so whoever's free can
--    count a van on or double-check it — not just the van's own driver.
--    (That also means drivers can read all jobs/customers/sites: the loading
--    cards need them. What each screen shows is still trimmed by the app.)
-- 2. One loader at a time: the app claims a report (loading_by/loading_at)
--    while someone's in it, and other phones see it locked.

alter table public.load_reports add column if not exists loading_by text not null default '';
alter table public.load_reports add column if not exists loading_at text not null default '';

do $$ declare t text; begin
  foreach t in array array['load_reports', 'load_lines'] loop
    execute format('drop policy if exists "read loading" on public.%I', t);
    execute format('drop policy if exists "add loading" on public.%I', t);
    execute format('drop policy if exists "change loading" on public.%I', t);
    execute format('create policy "read loading" on public.%I for select to authenticated using (public.dk_is_staff() or public.dk_my_driver() <> '''')', t);
    execute format('create policy "add loading" on public.%I for insert to authenticated with check (public.dk_can_edit() or public.dk_my_driver() <> '''')', t);
    execute format('create policy "change loading" on public.%I for update to authenticated using (public.dk_can_edit() or public.dk_my_driver() <> '''') with check (public.dk_can_edit() or public.dk_my_driver() <> '''')', t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['invoices', 'invoice_items', 'customers', 'customer_sites', 'collections', 'collection_items'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "driver read" on public.%I', t);
      execute format('create policy "driver read" on public.%I for select to authenticated using (public.dk_my_driver() <> '''')', t);
    end if;
  end loop;
end $$;
