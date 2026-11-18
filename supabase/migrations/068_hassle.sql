-- 068: manual hassle score on the account (1 = no bother, 5 = constant hassle;
-- 0 = not set) — pairs with payment reliability for the customer rating
alter table customers add column if not exists hassle smallint not null default 0;
