-- Bound every user's LLM spend per day (spec §6.5), whatever they insert through the API.
-- 1. Feedback items can be inserted only into a draft whose essay check was paid (drafts.quota_consumed_at set),
--    so free, unpaid drafts cannot be stuffed with self-written items to feed the hint routes.
-- 2. Every LLM hint call (levels 3-5) takes one of 60 daily hints through a security-definer counter.
-- Shared project: touches only schemas scholar and scholar_private.

alter table scholar.quota_usage add column hints smallint not null default 0;

drop policy "feedback_items: owner can insert for own draft" on scholar.feedback_items;
create policy "feedback_items: owner can insert into own paid draft" on scholar.feedback_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from scholar.drafts d
       where d.id = draft_id and d.user_id = (select auth.uid()) and d.quota_consumed_at is not null
    )
  );

create function scholar_private.consume_hint_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant int := 60; -- a constant, not a parameter the caller could raise
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into scholar.quota_usage as q (user_id, day, hints)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set hints = q.hints + 1
    where q.hints < c_daily_limit;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function scholar_private.consume_hint_quota() from public, anon;
grant execute on function scholar_private.consume_hint_quota() to authenticated;

create function scholar.consume_hint_quota() returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.consume_hint_quota(); $$;
revoke execute on function scholar.consume_hint_quota() from public, anon;
grant execute on function scholar.consume_hint_quota() to authenticated;
