-- English only (PR #18): the app no longer reads or writes feedback translations or the student's first language.
-- revise_item goes back to its pre-translation body (it no longer clears cached translations), then the unused
-- table and column are dropped. Dropping the column also drops its column-level update grant.
-- Shared project: touches only schemas scholar and scholar_private.

create or replace function scholar_private.revise_item(p_item_id uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(p_summary) not between 1 and 1000 then
    raise exception 'invalid summary' using errcode = '22023';
  end if;
  update scholar.feedback_items set revised_summary = p_summary where id = p_item_id and user_id = (select auth.uid());
  if not found then
    raise exception 'item not found' using errcode = '42501';
  end if;
end;
$$;

drop table scholar.item_translations;

alter table scholar.profiles drop column first_language;
