-- 067: accounts that shouldn't be chased after delivery (reviews, photos,
-- social, sample follow-ups) — ticked on the customer record
alter table customers add column if not exists no_follow_ups boolean not null default false;
