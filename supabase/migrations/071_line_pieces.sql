-- 071: uneven pallets — let a shipment line carry its own total pieces.
-- NULL means "work it out as pallets × qty per pallet" (the old behaviour);
-- a number is a hand-entered override for loads that don't come in even
-- pallet sizes.
alter table public.shipment_lines add column if not exists pieces numeric;
