-- Deck Kingdom Ops — instant updates between screens.
-- Every change already writes an audit_log row; publishing that table over
-- Supabase Realtime lets open screens hear about changes the moment they
-- commit (push), instead of asking every few seconds (poll). Safe to re-run.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end $$;
