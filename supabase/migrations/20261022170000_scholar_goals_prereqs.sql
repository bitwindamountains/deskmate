-- Course goals (B4.3): a deck keeps the syllabus, objectives or past exam questions the student pasted, and cards the device
-- matched to them come up sooner in reviews. Prerequisites (B4.1): concept-to-concept edges the student draws per deck.
-- Shared project: touches only schema scholar.
alter table scholar.decks add column goals text not null default '' check (length(goals) <= 5000);
alter table scholar.cards add column goal_match boolean not null default false;

-- One call per save, so a 2,000-card deck is one statement, not 2,000 updates. Not privileged: RLS applies (security invoker).
-- p_ids null means matching didn't run (the on-device model couldn't load): the goals save and the matches stay.
create function scholar.set_goal_matches(p_deck uuid, p_goals text, p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched integer;
begin
  if p_goals is null or length(p_goals) > 5000 then
    raise exception 'invalid goals' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 2000 then
    raise exception 'too many cards' using errcode = '22023';
  end if;
  update scholar.decks set goals = p_goals where id = p_deck and user_id = (select auth.uid());
  if not found then
    raise exception 'deck not found' using errcode = 'P0002';
  end if;
  if p_ids is not null then
    update scholar.cards set goal_match = (id = any(p_ids))
    where deck_id = p_deck and user_id = (select auth.uid()) and goal_match is distinct from (id = any(p_ids));
  end if;
  select count(*) into matched from scholar.cards where deck_id = p_deck and user_id = (select auth.uid()) and goal_match;
  return matched;
end;
$$;
revoke execute on function scholar.set_goal_matches(uuid, text, uuid[]) from public, anon;
grant execute on function scholar.set_goal_matches(uuid, text, uuid[]) to authenticated;

-- Keys are stored as the trimmed, lower-cased concept name, the same key the mastery map groups by.
create table scholar.concept_prereqs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id uuid not null references scholar.decks (id) on delete cascade,
  concept text not null check (length(concept) between 1 and 120 and concept = lower(btrim(concept))),
  prereq text not null check (length(prereq) between 1 and 120 and prereq = lower(btrim(prereq))),
  created_at timestamptz not null default now(),
  unique (deck_id, concept, prereq),
  check (concept <> prereq)
);
create index concept_prereqs_user_id_idx on scholar.concept_prereqs (user_id);
alter table scholar.concept_prereqs enable row level security;

revoke all on scholar.concept_prereqs from public, anon, authenticated;
grant select, insert, delete on scholar.concept_prereqs to authenticated;
grant all on scholar.concept_prereqs to service_role;

create policy "concept_prereqs: owner can select" on scholar.concept_prereqs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "concept_prereqs: owner can insert for own deck" on scholar.concept_prereqs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.decks d where d.id = deck_id and d.user_id = (select auth.uid()))
  );
create policy "concept_prereqs: owner can delete" on scholar.concept_prereqs
  for delete to authenticated using ((select auth.uid()) = user_id);
