-- 080: part payments on the purchase ledger + the bank transactions table.
-- Rerunnable.

-- ===== part payments: a list of { id, date, amount, method, ref } per purchase =====
-- Entries with a date_paid and no payment rows keep counting as fully paid.
alter table public.purchases
  add column if not exists payments jsonb not null default '[]'::jsonb;

-- ===== bank transactions: imported from statements (PDF/CSV), matched to the ledger =====
create table if not exists public.bank_transactions (
  id          text primary key,              -- hash of date|amount|balance|description: re-imports land on the same row
  tx_date     text not null,                 -- YYYY-MM-DD
  description text not null default '',
  tx_type     text not null default '',      -- Transfer | Card | Direct Debit | Standing Order …
  amount      numeric not null,              -- signed: + money in, − money out
  balance     numeric,                       -- running balance after this transaction
  seq         int not null default 0,        -- order within its statement (same-day ordering)
  source      text not null default '',      -- file it came from
  status      text not null default 'new',   -- new | matched | review | ignored
  match_kind  text not null default '',      -- invoice | purchase | purchase-part | wages | new-purchase | takings | transfer | covered | …
  match_ref   text not null default '',      -- invoice / purchase ids, or the person for wages
  match_label text not null default '',
  note        text not null default '',
  imported_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bank_transactions_date on public.bank_transactions (tx_date desc, seq desc);
create index if not exists bank_transactions_status on public.bank_transactions (status);

alter table public.bank_transactions enable row level security;
drop policy if exists bank_tx_admin_all on public.bank_transactions;
create policy bank_tx_admin_all on public.bank_transactions
  for all to authenticated
  using ((select public.dk_is_admin()))
  with check ((select public.dk_is_admin()));

-- wages seeded by 079 double-counted Martin (he invoices — he's in the purchase ledger)
delete from public.wages where person = 'Martin Brooks' and id like 'wg-bank-%';
