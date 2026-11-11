-- 057: job numbers can never be doubled up.
-- Three people can raise jobs at the same moment, and each PC picks "highest number I know + 1".
-- From now on the database has the final say: if a new job arrives with a number another job
-- already has, it is given the next free number instead (the app reads that back and shows it).
-- An existing job keeps the number it already has - only a job taking a used number is moved on.

create or replace function public.dk_inv_no_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cur int;
  had boolean;
  nxt int;
begin
  if new.inv_no is null then return new; end if;            -- website orders waiting for a number
  perform pg_advisory_xact_lock(5700057);                    -- one job number handed out at a time

  select inv_no into cur from public.invoices where id = new.id;
  had := found;
  if had and cur is not distinct from new.inv_no then return new; end if;   -- number not changing

  if not exists (select 1 from public.invoices where inv_no = new.inv_no and id <> new.id) then
    return new;                                              -- free: keep it
  end if;

  -- taken. A job that already had its own (unclashing) number keeps that one...
  if had and cur is not null and not exists (select 1 from public.invoices where inv_no = cur and id <> new.id) then
    new.inv_no := cur;
    return new;
  end if;
  -- ...a new job gets the next free number
  select greatest(coalesce(max(inv_no), 0) + 1,
                  coalesce((select nullif(value ->> 'invoice', '')::int from public.crm_settings where key = 'numbering'), 1))
    into nxt from public.invoices;
  new.inv_no := nxt;
  return new;
end; $$;

drop trigger if exists aa_inv_no_guard on public.invoices;
create trigger aa_inv_no_guard before insert or update of inv_no on public.invoices
  for each row execute function public.dk_inv_no_guard();

-- any numbers already doubled up (e.g. today's) - the newer job of each pair is listed here;
-- open it in ops and it keeps its number until you change it, or renumber it by hand
select i.inv_no, i.id, i.date, c.name as customer, i.created_by, i.updated_at
  from public.invoices i
  left join public.customers c on c.id = i.customer_id
 where i.inv_no in (select inv_no from public.invoices where inv_no is not null group by inv_no having count(*) > 1)
 order by i.inv_no, i.updated_at;
