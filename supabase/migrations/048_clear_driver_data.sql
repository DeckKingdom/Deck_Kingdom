-- Deck Kingdom Ops - let an admin clear the drivers' drop photos (Nov 2026)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Used by "Clear driver test data" on the Driver tracking screen (admin only).

drop policy if exists "drop photos admin remove" on storage.objects;
create policy "drop photos admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'drop-photos' and public.dk_is_admin());

select 'ok' as ready;
