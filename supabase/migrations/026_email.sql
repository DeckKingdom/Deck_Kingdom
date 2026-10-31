-- Deck Kingdom Ops - send email from ops (outgoing only)
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
--
-- Each ops login is linked to the mailbox it sends from (their Deck Kingdom
-- address at Krystal). Emails go out through that mailbox's SMTP from the
-- "send-email" edge function, and a copy of every sent email is logged
-- against the customer. Mailbox passwords can be written but never read back
-- by the app: only the edge function (service role) can see them.

create table if not exists public.mail_accounts (
  login_email text primary key,          -- the ops login (lower case)
  from_email  text not null default '',  -- address the customer sees
  from_name   text not null default '',
  smtp_host   text not null default 'mail.deckkingdom.co.uk',
  smtp_port   integer not null default 465,
  smtp_user   text not null default '',  -- usually the same as from_email
  smtp_pass   text not null default '',
  signature   text not null default '',
  copy_me     boolean not null default true,  -- bcc the sender so it lands in their inbox
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);
alter table public.mail_accounts enable row level security;
-- deliberately no policies: the table is only reached through the functions below

-- every login with its sending set-up (never the password)
create or replace function public.mail_accounts_list()
returns table (login_email text, full_name text, from_email text, from_name text, smtp_host text,
               smtp_port integer, smtp_user text, signature text, copy_me boolean, has_password boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(p.email), p.full_name, coalesce(m.from_email, ''), coalesce(m.from_name, ''),
         coalesce(m.smtp_host, 'mail.deckkingdom.co.uk'), coalesce(m.smtp_port, 465), coalesce(m.smtp_user, ''),
         coalesce(m.signature, ''), coalesce(m.copy_me, true), coalesce(m.smtp_pass, '') <> '', m.updated_at
  from public.profiles p
  left join public.mail_accounts m on m.login_email = lower(p.email)
  where auth.role() = 'authenticated' and coalesce(p.email, '') <> ''
  order by lower(p.email);
$$;

-- link / update a login's mailbox; a blank password keeps the saved one
create or replace function public.mail_account_save(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text := lower(trim(coalesce(p->>'login_email', '')));
begin
  if auth.role() <> 'authenticated' then raise exception 'not signed in'; end if;
  if k = '' then raise exception 'login_email required'; end if;
  insert into public.mail_accounts as m (login_email, from_email, from_name, smtp_host, smtp_port, smtp_user, smtp_pass, signature, copy_me, updated_at, updated_by)
  values (k, trim(coalesce(p->>'from_email', '')), trim(coalesce(p->>'from_name', '')),
          coalesce(nullif(trim(p->>'smtp_host'), ''), 'mail.deckkingdom.co.uk'),
          coalesce(nullif(p->>'smtp_port', '')::int, 465),
          trim(coalesce(p->>'smtp_user', '')), coalesce(p->>'smtp_pass', ''),
          coalesce(p->>'signature', ''), coalesce((p->>'copy_me')::boolean, true), now(), coalesce(auth.jwt()->>'email', ''))
  on conflict (login_email) do update set
    from_email = excluded.from_email, from_name = excluded.from_name, smtp_host = excluded.smtp_host,
    smtp_port = excluded.smtp_port, smtp_user = excluded.smtp_user,
    smtp_pass = case when excluded.smtp_pass <> '' then excluded.smtp_pass else m.smtp_pass end,
    signature = excluded.signature, copy_me = excluded.copy_me, updated_at = now(), updated_by = excluded.updated_by;
end; $$;

create or replace function public.mail_account_remove(p_login text)
returns void language sql security definer set search_path = public as $$
  delete from public.mail_accounts where login_email = lower(trim(p_login)) and auth.role() = 'authenticated';
$$;

revoke all on function public.mail_accounts_list() from public, anon;
revoke all on function public.mail_account_save(jsonb) from public, anon;
revoke all on function public.mail_account_remove(text) from public, anon;
grant execute on function public.mail_accounts_list() to authenticated;
grant execute on function public.mail_account_save(jsonb) to authenticated;
grant execute on function public.mail_account_remove(text) to authenticated;

-- ===== what went out =====
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  sent_at     timestamptz not null default now(),
  sent_by     text not null default '',   -- ops login
  from_email  text not null default '',
  to_email    text not null default '',
  cc          text not null default '',
  subject     text not null default '',
  body        text not null default '',
  customer_id text not null default '',
  site_id     text not null default ''
);
create index if not exists email_log_customer_idx on public.email_log (customer_id, sent_at desc);
alter table public.email_log enable row level security;
drop policy if exists "staff read email log" on public.email_log;
create policy "staff read email log" on public.email_log for select to authenticated using (true);
-- no insert policy: only the edge function (service role) writes here
