-- 083: FAR Logistics is the freight forwarder — container shipping, not couriers.
-- Recode their ledger entries to Carriage / Import freight (new sub).
update public.purchases p
set cost_centre = 'Carriage', cost_sub = 'Import freight'
from public.suppliers s
where s.id = p.supplier_id and s.name ~* 'far logistics'
  and (p.cost_centre is distinct from 'Carriage' or p.cost_sub is distinct from 'Import freight');

update public.bank_transactions
set match_ref = 'Carriage|Import freight'
where description ~* 'far logistics' and match_kind = 'spend';

select p.cost_centre, p.cost_sub, count(*) n, round(sum(coalesce(p.sub_total,0) * (1 + coalesce(p.vat_rate,20)/100.0))) approx_total
from public.purchases p join public.suppliers s on s.id = p.supplier_id
where s.name ~* 'far logistics' group by 1, 2;
