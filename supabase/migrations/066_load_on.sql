-- 066: the loader can move a run's loading day (weekend runs sit on Friday
-- by default and can be pushed to Sat / Sun / the morning it goes out)
alter table load_reports add column if not exists load_on date;
