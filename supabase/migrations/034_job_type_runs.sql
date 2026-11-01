-- Deck Kingdom Ops — job type "Delivery" + a separate run number
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run (safe to re-run).
-- "Delivery Run 1/2/3" becomes job type "Delivery" with run 1/2/3 in its own field
-- (shown as the Run pill on the delivery schedule). Anything still arriving as
-- "Delivery Run N" (FileMaker, the website feed) is converted the same way.
alter table public.invoices add column if not exists run_no text not null default '';

create or replace function public.dk_job_type_run()
returns trigger language plpgsql as $$
declare m text[];
begin
  m := regexp_match(coalesce(new.job_type, ''), '^\s*Delivery Run\s*(\d+)\s*$', 'i');
  if m is not null then
    new.job_type := 'Delivery';
    if coalesce(new.run_no, '') = '' then new.run_no := m[1]; end if;
  end if;
  return new;
end; $$;

drop trigger if exists a0_dk_job_type_run on public.invoices;
create trigger a0_dk_job_type_run before insert or update of job_type on public.invoices
  for each row execute function public.dk_job_type_run();

-- existing jobs
update public.invoices set job_type = job_type where job_type ~* '^\s*Delivery Run\s*\d+\s*$';
