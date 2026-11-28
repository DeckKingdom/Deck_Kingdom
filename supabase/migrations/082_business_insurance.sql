-- 082: Sandham Davies & Jones is the business insurance (stock, public & employers'
-- liability) — not vehicles. Recode their ledger entries (and any Close Brothers
-- premium-finance row that names them) to Finance & Professional / Business insurance,
-- and fix the register line if one was added for them.
update public.purchases p
set cost_centre = 'Finance & Professional', cost_sub = 'Business insurance'
from public.suppliers s
where s.id = p.supplier_id
  and (s.name ~* 'sandham|davies (&|and) jones' or (s.name ~* 'close brothers' and coalesce(p.inv_detail, '') ~* 'sandham'))
  and (p.cost_centre is distinct from 'Finance & Professional' or p.cost_sub is distinct from 'Business insurance');

update public.commitments
set cost_centre = 'Finance & Professional', cost_sub = 'Business insurance'
where (supplier ~* 'sandham' or name ~* 'sandham');

-- bank rows already assigned to the wrong centre (none expected, but just in case)
update public.bank_transactions
set match_ref = 'Finance & Professional|Business insurance',
    match_label = 'Business insurance — stock, PL/EL (Sandham Davies & Jones) → Finance & Professional · Business insurance'
where description ~* 'sandham' and match_kind = 'spend';

select s.name, p.inv_date, p.inv_detail, p.cost_centre, p.cost_sub
from public.purchases p join public.suppliers s on s.id = p.supplier_id
where s.name ~* 'sandham|davies' or p.inv_detail ~* 'sandham';
