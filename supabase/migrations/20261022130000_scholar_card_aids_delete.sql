-- Cached card help goes stale when the student edits the card: it would keep teaching the old, possibly wrong, answer.
-- The app now drops a cached row whose card text changed and asks again. Deleting a row only forces a fresh call,
-- which still takes the daily helper quota first, so this grant cannot be used to skip the quota.
-- Shared project: touches only schema scholar.
grant delete on scholar.card_aids to authenticated;

create policy "card_aids: owner can delete" on scholar.card_aids
  for delete to authenticated using ((select auth.uid()) = user_id);
