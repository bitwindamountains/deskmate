-- The largest snapshot is a feedback item: summary, revised_summary and quote, up to 1,000 characters each, so up to
-- ~12 KB of UTF-8. 8 KB could reject a real report; 16 KB fits the largest. Shared project: touches only schema scholar.
alter table scholar.problem_reports drop constraint problem_reports_snapshot_check;
alter table scholar.problem_reports add constraint problem_reports_snapshot_check
  check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 16384);
