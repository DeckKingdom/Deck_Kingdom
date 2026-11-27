-- 077: Close Brothers do both — insurance premium finance and the FLT
-- repayment. Split the existing rows on the invoice wording: anything
-- mentioning insurance goes under Fleet, the rest stays Plant / Forklift
-- finance. New entries already follow the same rule in the app.
update public.purchases p
set cost_centre = 'Fleet', cost_sub = 'Insurance & breakdown'
from public.suppliers s
where s.id = p.supplier_id
  and s.name ~* 'close brothers'
  and coalesce(p.inv_detail, '') ~* 'insurance'
  and (p.cost_centre is distinct from 'Fleet' or p.cost_sub is distinct from 'Insurance & breakdown');

-- what Close Brothers rows look like now
select p.cost_centre, p.cost_sub, count(*) n, round(sum(coalesce(p.sub_total,0) * (1 + coalesce(p.vat_rate,20)/100.0))) approx_total
from public.purchases p join public.suppliers s on s.id = p.supplier_id
where s.name ~* 'close brothers'
group by 1, 2 order by 4 desc;
