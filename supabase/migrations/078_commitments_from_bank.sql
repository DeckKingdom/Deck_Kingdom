-- 078: the fixed-cost register, filled from the bank statements Aug–Nov 2026.
-- Amounts are the typical (median) payment; "usually ~day N" in the notes is
-- when it normally leaves the bank. Rerunnable: a row is skipped when the
-- register already has that supplier (so anything you've added by hand,
-- including via Mark recurring, is left alone).

with seed (name, supplier, cost_centre, cost_sub, amount, freq, method, renewal_date, notes) as (
  values
  -- premises
  ('Unit rent',                 'JE Kirk Property',        'Premises', 'Rent',      2400.00, 'Monthly', 'Bank', '', 'paid in £200–250 instalments across the month (bank Aug–Nov 26)'),
  ('Landlord buildings insurance recharge', 'JE Kirk Property', 'Premises', 'Other', 971.31, 'Annual', 'Bank', '2027-08-14', 'recharged once a year, mid August'),
  ('Business rates',            'Tameside MBC',            'Premises', 'Rates',      611.00, 'Monthly', 'DD',   '', 'usually ~23rd'),
  ('Gas & electric',            'British Gas Business',    'Premises', 'Utilities',  435.00, 'Monthly', 'DD',   '', 'usually ~18th; winter months run to ~£726'),
  ('Water',                     'Water Plus',              'Premises', 'Utilities', 1063.52, 'Monthly', 'Card', '', 'usually ~19th — the biggest utility by far'),
  ('Waste collection',          'Premier Waste',           'Premises', 'Utilities',  293.00, 'Monthly', 'Bank', '', 'usually ~13th'),
  -- fleet & plant
  ('Fuel cards',                'Allstar',                 'Fleet', 'Fuel',          800.00, 'Weekly',  'DD',   '', 'weekly, midweek; varies £150–950 with mileage (≈£3.5k/mo)'),
  ('Fleet insurance premium finance', 'Close Brothers — Stephenson & Threadgold', 'Fleet', 'Insurance & breakdown', 591.38, 'Monthly', 'DD', '', 'usually ~22nd'),
  ('Breakdown cover',           'RAC',                     'Fleet', 'Insurance & breakdown', 108.00, 'Monthly', 'DD', '', 'usually ~28th'),
  ('Forklift finance',          'Close Brothers',          'Plant', 'Forklift finance', 208.79, 'Monthly', 'DD', '', 'usually ~19th'),
  -- staff
  ('Pension (NEST)',            'NEST',                    'Staff & Subcontract', 'Other', 84.00, 'Monthly', 'DD', '', 'collections irregular — Nov took 3 months (£252) in one go'),
  -- marketing & software
  ('beSeen SEO membership',     'Skool.com',               'Marketing & Web', 'SEO consulting', 672.80, 'Monthly', 'Card', '', '$899/mo, usually ~27th — moves with the exchange rate'),
  ('ahrefs',                    'ahrefs',                  'Marketing & Web', 'Tools & hosting', 79.00, 'Monthly', 'Card', '', 'usually ~13th'),
  ('Krystal hosting',           'Krystal',                 'Marketing & Web', 'Tools & hosting', 87.00, 'Monthly', 'Card', '', 'two subs: £13.20 early month + ~£70 mid-month'),
  ('Google Cloud',              'Google Cloud',            'Marketing & Web', 'Tools & hosting', 33.00, 'Monthly', 'Card', '', 'usually ~3rd'),
  ('Canva',                     'Canva',                   'Marketing & Web', 'Tools & hosting', 17.00, 'Monthly', 'Card', '', 'usually ~21st'),
  -- office
  ('Phone & broadband',         'BT Business',             'Office & Misc', 'General', 47.94, 'Monthly', 'DD',   '', 'usually ~5th'),
  ('ChatGPT',                   'OpenAI',                  'Office & Misc', 'General', 20.00, 'Monthly', 'Card', '', 'usually ~23rd'),
  ('Claude',                    'Anthropic',               'Office & Misc', 'General', 90.00, 'Monthly', 'Card', '', 'usually ~27th'),
  ('Air Landline',              'Air Landline',            'Office & Misc', 'General', 11.99, 'Monthly', 'Card', '', 'usually ~5th')
)
insert into public.commitments (id, name, supplier, cost_centre, cost_sub, amount, freq, method, start_date, term_months, renewal_date, notes, active)
select 'cm-bank-' || substr(md5(s.name || s.supplier), 1, 10),
       s.name, s.supplier, s.cost_centre, s.cost_sub, s.amount, s.freq, s.method,
       '', 0, s.renewal_date, s.notes, true
from seed s
where not exists (
  select 1 from public.commitments c
  where lower(c.supplier) = lower(s.supplier) and lower(c.name) = lower(s.name)
);

-- the register as it now stands, dearest first (monthly equivalents)
select name, supplier, cost_centre || ' · ' || cost_sub as centre, method, freq,
       round(amount * case freq when 'Weekly' then 52/12.0 when '4-weekly' then 13/12.0 when 'Quarterly' then 1/3.0 when 'Annual' then 1/12.0 else 1 end) as monthly_eq
from public.commitments where active order by monthly_eq desc;
