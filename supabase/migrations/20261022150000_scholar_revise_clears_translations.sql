-- A translation cached before the coach revised an item would keep explaining the old feedback in the student's first
-- language. revise_item now also clears that item's cached translations; the next "Explain in …" asks again (one helper
-- call). Security definer already, so no new grant: a user can still only reach their own item.
-- Shared project: touches only schema scholar_private.

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
  delete from scholar.item_translations where item_id = p_item_id;
end;
$$;
