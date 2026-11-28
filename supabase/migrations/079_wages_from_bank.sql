-- 079: wages seeded from the bank statements, Aug–Nov 2026. These are the
-- amounts that actually left the bank (net), filed in the gross column until
-- real payroll figures replace them — edit any cell on the Wages screen.
-- November runs to the 25th only. Rerunnable: skips a month a person
-- already has a row for.

with seed (month, person, gross, notes) as (
  values
  ('2026-08', 'Molly Draper',      1531.00, 'net paid from bank · 4 payments (£383/wk)'),
  ('2026-09', 'Molly Draper',      1531.00, 'net paid from bank · 4 payments'),
  ('2026-10', 'Molly Draper',      1914.00, 'net paid from bank · 5 payments'),
  ('2026-11', 'Molly Draper',      1148.00, 'net paid from bank · to 25 Nov'),
  ('2026-08', 'Ian Blackwood',      123.00, 'net paid from bank · 1 payment'),
  ('2026-09', 'Ian Blackwood',     2232.00, 'net paid from bank · 4 payments (~£711/wk)'),
  ('2026-10', 'Ian Blackwood',     3893.00, 'net paid from bank · 8 payments'),
  ('2026-11', 'Ian Blackwood',     2570.00, 'net paid from bank · to 25 Nov'),
  ('2026-08', 'Martin Brooks',     2222.00, 'net paid from bank · 14 per-shift payments'),
  ('2026-09', 'Martin Brooks',     2920.00, 'net paid from bank · 16 per-shift payments'),
  ('2026-10', 'Martin Brooks',     2148.00, 'net paid from bank · 15 per-shift payments'),
  ('2026-11', 'Martin Brooks',     1723.00, 'net paid from bank · to 25 Nov'),
  ('2026-09', 'Mark Murray',        106.00, 'net paid from bank'),
  ('2026-10', 'Mark Murray',        216.00, 'net paid from bank'),
  ('2026-08', 'Amanda Cheetham',   2750.00, 'net paid from bank · labelled expenses — split drawings/wages as needed'),
  ('2026-09', 'Amanda Cheetham',   3090.00, 'net paid from bank · labelled expenses'),
  ('2026-10', 'Amanda Cheetham',   3489.00, 'net paid from bank · labelled expenses'),
  ('2026-11', 'Amanda Cheetham',   2860.00, 'net paid from bank · to 25 Nov'),
  ('2026-08', 'Jonathan Cheetham', 1350.00, 'net paid from bank · labelled expenses — split drawings/wages as needed'),
  ('2026-09', 'Jonathan Cheetham', 1700.00, 'net paid from bank · labelled expenses'),
  ('2026-10', 'Jonathan Cheetham', 1150.00, 'net paid from bank · labelled expenses'),
  ('2026-11', 'Jonathan Cheetham', 1051.00, 'net paid from bank · to 25 Nov')
)
insert into public.wages (id, month, person, gross, emp_ni, pension, other, notes, paid_date)
select 'wg-bank-' || s.month || '-' || substr(md5(s.person), 1, 8),
       s.month, s.person, s.gross, 0, 0, 0, s.notes, ''
from seed s
where not exists (
  select 1 from public.wages w where w.month = s.month and lower(w.person) = lower(s.person)
);

-- how the months total up
select month, count(*) people, round(sum(gross + emp_ni + pension + other)) employer_cost
from public.wages group by 1 order by 1 desc;
