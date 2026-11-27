-- 072: plan targets on shipment lines — the quantity the purchase plan calls
-- for, shown beside the live pieces so reworked shipments can be compared
-- against the plan at a glance. NULL = no target set.
alter table public.shipment_lines add column if not exists target numeric;
