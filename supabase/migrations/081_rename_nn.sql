-- 081: account #526 "Norbert" is N&N Landscaping and Driveways — named the way their
-- bank transfers read, so the Bank screen matches their payments by name.
-- Norbert stays on the record as the contact. Touches this one customer only.
update public.customers
set name    = 'N&N Landscaping and Driveways',
    contact = case when coalesce(contact, '') = '' then 'Norbert' else contact end
where id = 'fm-c-526' and name = 'Norbert';

select id, name, contact from public.customers where id = 'fm-c-526';
