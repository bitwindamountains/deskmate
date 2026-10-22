-- Timed writing practice (A4.5): an essay can be written under a 20, 30 or 45 minute limit, and its first draft records the
-- minutes the student used. The feedback then weighs structure and planning over polish.
-- Shared project: touches only schema scholar.
alter table scholar.essays add column timed_minutes smallint check (timed_minutes in (20, 30, 45));
alter table scholar.drafts add column minutes_used smallint check (minutes_used between 0 and 600);

-- Inserted with the essay and its first draft; never updated afterwards (no update grant on either column).
grant insert (minutes_used) on scholar.drafts to authenticated;
