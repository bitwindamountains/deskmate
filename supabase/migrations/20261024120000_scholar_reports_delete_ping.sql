-- "Report a problem" on cards and feedback (brief lines 442 and 853), "delete my data" (brief E4), and a ping for the
-- daily keep-alive so the free project doesn't pause (spec §11). Shared project: touches only scholar and scholar_private.

-- ---------------------------------------------------------------- problem_reports
-- target_id is not a foreign key: a report outlives the card or item, so it stays as quality data.
create table scholar.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target text not null check (target in ('card', 'feedback_item')),
  target_id uuid not null,
  reason text not null check (reason in ('wrong', 'unclear', 'not_in_source', 'grading', 'unfair', 'other')),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now()
);
create index problem_reports_user_id_idx on scholar.problem_reports (user_id);
alter table scholar.problem_reports enable row level security;

revoke all on scholar.problem_reports from public, anon, authenticated;
grant select on scholar.problem_reports to authenticated;
grant insert (user_id, target, target_id, reason, note) on scholar.problem_reports to authenticated;
grant all on scholar.problem_reports to service_role;

create policy "problem_reports: owner can select" on scholar.problem_reports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "problem_reports: owner can insert for own target" on scholar.problem_reports
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (target = 'card' and exists (select 1 from scholar.cards c where c.id = target_id and c.user_id = (select auth.uid())))
      or (target = 'feedback_item'
        and exists (select 1 from scholar.feedback_items f where f.id = target_id and f.user_id = (select auth.uid())))
    )
  );

-- ---------------------------------------------------------------- delete my data
-- Deletes the caller's Scholar data, never the auth.users row: the sign-in is shared with other apps on this project.
-- Everything else cascades from decks and essays. quota_usage and llm_calls stay: they hold no content,
-- and deleting them would reset the day's limits.
create function scholar_private.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from scholar.problem_reports where user_id = v_uid;
  delete from scholar.essays where user_id = v_uid;
  delete from scholar.decks where user_id = v_uid;
  delete from scholar.profiles where user_id = v_uid;
end;
$$;
revoke execute on function scholar_private.delete_my_data() from public, anon;
grant execute on function scholar_private.delete_my_data() to authenticated;

create function scholar.delete_my_data()
returns void
language sql
security invoker
set search_path = ''
as $$
  select scholar_private.delete_my_data();
$$;
revoke execute on function scholar.delete_my_data() from public, anon;
grant execute on function scholar.delete_my_data() to authenticated;

-- ---------------------------------------------------------------- ping
-- The keep-alive cron has no user, so anon may call this. It reads nothing.
create function scholar.ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;
revoke execute on function scholar.ping() from public;
grant execute on function scholar.ping() to anon, authenticated, service_role;
