-- A report keeps a copy of the text it was about (card front/back, or feedback summary/quote), so it still means
-- something after the student edits or deletes the card. Shared project: touches only schema scholar.
alter table scholar.problem_reports
  add column snapshot jsonb not null default '{}'::jsonb
  check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 8192);
grant insert (snapshot) on scholar.problem_reports to authenticated;
