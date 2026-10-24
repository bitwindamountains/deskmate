-- The report snapshot is filled in by the database, not sent by the client, so it is a true copy of the reported text.
-- Card text has no length limit, so each field is cut to 1,000 characters: every snapshot then fits the 16 KB check
-- and any card can be reported. Shared project: touches only schemas scholar and scholar_private.
revoke insert (snapshot) on scholar.problem_reports from authenticated;

-- Runs before the insert policy's WITH CHECK, which still rejects a user_id or target that isn't the caller's.
create function scholar_private.fill_report_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.snapshot := '{}'::jsonb;
  if new.target = 'card' then
    select jsonb_build_object('front', left(c.front, 1000), 'back', left(c.back, 1000)) into new.snapshot
    from scholar.cards c where c.id = new.target_id and c.user_id = new.user_id;
  elsif new.target = 'feedback_item' then
    select jsonb_build_object('summary', left(f.summary, 1000), 'revised_summary', left(f.revised_summary, 1000),
      'quote', left(f.quote, 1000)) into new.snapshot
    from scholar.feedback_items f where f.id = new.target_id and f.user_id = new.user_id;
  end if;
  new.snapshot := coalesce(new.snapshot, '{}'::jsonb);
  return new;
end;
$$;
revoke execute on function scholar_private.fill_report_snapshot() from public, anon, authenticated;

create trigger problem_reports_fill_snapshot
  before insert on scholar.problem_reports
  for each row execute function scholar_private.fill_report_snapshot();
