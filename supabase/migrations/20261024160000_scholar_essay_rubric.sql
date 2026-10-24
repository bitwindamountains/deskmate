-- A2.1: an essay can carry the student's own rubric (2 to 8 criteria, each scored 1-4). Null means the default rubric.
-- The app re-checks the shape on every read (src/lib/essay/rubric.ts); this check bounds its size.
-- Shared project: touches only schema scholar. Insert on scholar.essays is already granted for every column.
alter table scholar.essays add column rubric jsonb
  check (rubric is null or (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 2 and 8 and pg_column_size(rubric) <= 8192));
