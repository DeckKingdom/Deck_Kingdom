-- 075: cost centres on the purchase ledger + the wages table.
-- Rerunnable: the backfill only touches rows whose cost_centre is still blank,
-- so hand-recoded rows are never overwritten by a second run.
-- Mirrors src/lib/costCentres.js — change both together.

alter table public.purchases
  add column if not exists cost_centre text not null default '',
  add column if not exists cost_sub    text not null default '';

-- ===== backfill: supplier rules first (most specific wins), category fallback =====
with named as (
  select p.id,
         coalesce(s.name, '')        as sup,
         coalesce(p.inv_detail, '')  as det,
         coalesce(p.category, '')    as cat
  from public.purchases p
  left join public.suppliers s on s.id = p.supplier_id
  where coalesce(p.cost_centre, '') = ''
),
decided as (
  select id,
    case
      -- supplier rules
      when sup ~* 'seneca|revolve' and det ~* 'facilit|ratchet|interest|bank fee|vat part'
                                                   then 'Finance & Professional|Trade finance interest'
      when sup ~* 'seneca|revolve'                 then 'Stock|Veejoy repayments'
      when sup ~* 'close brothers'                 then 'Plant|Forklift finance'
      when sup ~* 'joanne kirk|j ?e ?kirk'         then 'Premises|Rent'
      when sup ~* 'tameside met'                   then 'Premises|Rates'
      when sup ~* 'waterplus|british gas|yu energy|premier waste' then 'Premises|Utilities'
      when sup ~* 'amdec|tag forklift|cheshire gas' then 'Plant|Forklift'
      when sup ~* 'racking'                        then 'Plant|Warehouse equipment'
      when sup ~* 'martin brooks|ricky ward|mark murray|ian blackwood|sean c craven'
                                                   then 'Staff & Subcontract|Subcontract drivers'
      when sup ~* 'molly draper'                   then 'Staff & Subcontract|Other'
      when sup ~* 'skool|3rdway|third way'         then 'Marketing & Web|SEO consulting'
      when sup ~* 'ahrefs|krystal|swift hosting|checkatrade' then 'Marketing & Web|Tools & hosting'
      when sup ~* 'urban haze|rainworks'           then 'Marketing & Web|Design & print'
      when sup ~* 'business matters|fairfield gold' then 'Marketing & Web|Sponsorship'
      when sup ~* 'dvla|dart charge|mersey flow|tyne tunnel|clean air|m6 toll|car park'
                                                   then 'Fleet|Road, tolls & fines'
      when sup ~* 'rac breakdown|tempcover'        then 'Fleet|Insurance & breakdown'
      when sup ~* '^fuel$|allstar'                 then 'Fleet|Fuel'
      when sup ~* 'evri|hermes|post office|parcel2go|far logistics|s\.?j courier|red funnel'
                                                   then 'Carriage|Couriers'
      when sup ~* 'quickbooks|courthill|accountant' then 'Finance & Professional|Accountancy & software'
      when sup ~* 'bromleys|solicitor'             then 'Finance & Professional|Legal'
      when sup ~* '^hmrc$'                         then 'Finance & Professional|HMRC'
      when sup ~* 'tuda|tradescape|south yorkshire composites|ssh trading|tuffx|veejoy|dino decking|cladco'
                                                   then 'Stock|Product purchases'
      -- category fallback
      when cat in ('Products', 'Materials')        then 'Stock|Product purchases'
      when cat = 'Fuel'                            then 'Fleet|Fuel'
      when cat in ('Vehicle Repairs & Maintenance', 'Vehicle') then 'Fleet|Repairs & maintenance'
      when cat in ('Insurances', 'Insurance')      then 'Fleet|Insurance & breakdown'
      when cat = 'Trailer Hire'                    then 'Fleet|Hire'
      when cat in ('Parking', 'Penalty Charge / Fines') then 'Fleet|Road, tolls & fines'
      when cat = 'Forklift truck'                  then 'Plant|Forklift'
      when cat in ('Couriers', 'Couriers & freight') then 'Carriage|Couriers'
      when cat = 'Postage'                         then 'Carriage|Postage'
      when cat = 'Subcontractors & drivers'        then 'Staff & Subcontract|Subcontract drivers'
      when cat in ('Accountancy', 'Professional fees') then 'Finance & Professional|Accountancy & software'
      when cat = 'Bank, finance & fees'            then 'Finance & Professional|Trade finance interest'
      when cat in ('HMRC', 'Tax & government')     then 'Finance & Professional|HMRC'
      when cat = 'Premises & utilities'            then 'Premises|Utilities'
      when cat in ('Marketing', 'Website & software') then 'Marketing & Web|Tools & hosting'
      when cat = 'Sponsorship'                     then 'Marketing & Web|Sponsorship'
      when cat = 'Stationary & Office Supplies'    then 'Office & Misc|Stationery & supplies'
      when cat in ('Tools/Misc', 'Tools & equipment') then 'Office & Misc|Tools'
      when cat in ('Food & Beverage', 'Meeting', 'Travel & subsistence') then 'Office & Misc|Food & meetings'
      else 'Office & Misc|General'
    end as pair
  from named
)
update public.purchases p
set cost_centre = split_part(d.pair, '|', 1),
    cost_sub    = split_part(d.pair, '|', 2)
from decided d
where d.id = p.id;

-- ===== wages: keyed in monthly, ADMIN EYES ONLY (enforced here, not just in the UI) =====
create table if not exists public.wages (
  id         text primary key,
  month      text not null default '',  -- 'YYYY-MM'
  person     text not null default '',
  gross      numeric not null default 0,
  emp_ni     numeric not null default 0, -- employer NI
  pension    numeric not null default 0, -- employer pension
  other      numeric not null default 0, -- bonuses, expenses paid through payroll
  notes      text not null default '',
  paid_date  text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.wages enable row level security;
drop policy if exists wages_admin_all on public.wages;
create policy wages_admin_all on public.wages
  for all to authenticated
  using ((select public.dk_is_admin()))
  with check ((select public.dk_is_admin()));

-- how it landed
select cost_centre, cost_sub, count(*) n, round(sum(coalesce(sub_total,0) * (1 + coalesce(vat_rate,20)/100.0))) approx_total
from public.purchases group by 1, 2 order by 4 desc;
