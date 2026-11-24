-- Bound AI grading per user per day (2026-11-25 review): /api/grade was the only LLM route with no cap, so one signed-in
-- script could use up the shared free-tier capacity for every student. 300 new grades a day is far above a real
-- session; cached answers (grade_cache) don't count. Shared project: touches only schemas scholar and scholar_private.

alter table scholar.quota_usage add column grades smallint not null default 0;

create function scholar_private.consume_grade_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant int := 300; -- a constant, not a parameter the caller could raise
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into scholar.quota_usage as q (user_id, day, grades)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set grades = q.grades + 1
    where q.grades < c_daily_limit;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function scholar_private.consume_grade_quota() from public, anon;
grant execute on function scholar_private.consume_grade_quota() to authenticated;

create function scholar.consume_grade_quota() returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.consume_grade_quota(); $$;
revoke execute on function scholar.consume_grade_quota() from public, anon;
grant execute on function scholar.consume_grade_quota() to authenticated;
