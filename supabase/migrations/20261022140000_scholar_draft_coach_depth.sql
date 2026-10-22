-- Draft Coach depth (Phase 2b): a dialogue on each feedback item, cached first-language explanations, a self-assessment
-- before feedback, items the coach withdraws after a dispute, the prompt-alignment checklist and the reverse outline.
-- Shared project: touches only schemas scholar and scholar_private.

-- ---------------------------------------------------------------- feedback_items: withdrawn, revised summary
alter table scholar.feedback_items drop constraint feedback_items_status_check;
alter table scholar.feedback_items add constraint feedback_items_status_check
  check (status in ('open', 'partial', 'addressed', 'got_it', 'disputed', 'withdrawn'));
-- Not in the user update grant: only the coach's "modify" verdict writes it, through revise_item.
alter table scholar.feedback_items add column revised_summary text check (char_length(revised_summary) <= 1000);

create function scholar_private.revise_item(p_item_id uuid, p_summary text)
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

-- ---------------------------------------------------------------- analyses: prompt alignment; drafts: outline
alter table scholar.analyses add column prompt_alignment jsonb;
-- On drafts, not analyses: the paragraphs layer can finish before the global layer writes the analyses row.
alter table scholar.drafts add column outline jsonb;

create function scholar_private.set_outline(p_draft_id uuid, p_outline jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if jsonb_typeof(p_outline) <> 'array' then
    raise exception 'invalid outline' using errcode = '22023';
  end if;
  if not exists (select 1 from scholar.drafts d where d.id = p_draft_id and d.user_id = v_uid) then
    raise exception 'draft not found' using errcode = '42501';
  end if;
  update scholar.drafts set outline = p_outline where id = p_draft_id and outline is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function scholar_private.revise_item(uuid, text) from public, anon;
revoke execute on function scholar_private.set_outline(uuid, jsonb) from public, anon;
grant execute on function scholar_private.revise_item(uuid, text) to authenticated;
grant execute on function scholar_private.set_outline(uuid, jsonb) to authenticated;

create function scholar.revise_item(p_item_id uuid, p_summary text) returns void
language sql security invoker set search_path = '' as $$ select scholar_private.revise_item(p_item_id, p_summary); $$;
create function scholar.set_outline(p_draft_id uuid, p_outline jsonb) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.set_outline(p_draft_id, p_outline); $$;
revoke execute on function scholar.revise_item(uuid, text) from public, anon;
revoke execute on function scholar.set_outline(uuid, jsonb) from public, anon;
grant execute on function scholar.revise_item(uuid, text) to authenticated;
grant execute on function scholar.set_outline(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- feedback_messages
create table scholar.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references scholar.feedback_items (id) on delete cascade,
  role text not null check (role in ('student', 'coach')),
  kind text not null check (kind in ('question', 'dispute')),
  text text not null check (char_length(text) between 1 and 2000),
  verdict text check (verdict in ('keep', 'modify', 'withdraw')),
  created_at timestamptz not null default now()
);
create index feedback_messages_item_id_idx on scholar.feedback_messages (item_id);
create index feedback_messages_user_id_idx on scholar.feedback_messages (user_id);
alter table scholar.feedback_messages enable row level security;

revoke all on scholar.feedback_messages from public, anon, authenticated;
grant select, insert on scholar.feedback_messages to authenticated;
grant all on scholar.feedback_messages to service_role;

create policy "feedback_messages: owner can select" on scholar.feedback_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "feedback_messages: owner can insert for own item" on scholar.feedback_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.feedback_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- item_translations
create table scholar.item_translations (
  item_id uuid not null references scholar.feedback_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lang text not null check (lang in ('fil', 'es')),
  level smallint not null check (level between 0 and 5), -- hint levels revealed when translated
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (item_id, lang, level)
);
create index item_translations_user_id_idx on scholar.item_translations (user_id);
alter table scholar.item_translations enable row level security;

revoke all on scholar.item_translations from public, anon, authenticated;
grant select, insert on scholar.item_translations to authenticated;
grant all on scholar.item_translations to service_role;

create policy "item_translations: owner can select" on scholar.item_translations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "item_translations: owner can insert for own item" on scholar.item_translations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.feedback_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- self_assessments
create table scholar.self_assessments (
  draft_id uuid primary key references scholar.drafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scores jsonb not null check (jsonb_typeof(scores) = 'array'),
  weakness text check (char_length(weakness) <= 300),
  created_at timestamptz not null default now()
);
create index self_assessments_user_id_idx on scholar.self_assessments (user_id);
alter table scholar.self_assessments enable row level security;

revoke all on scholar.self_assessments from public, anon, authenticated;
grant select, insert on scholar.self_assessments to authenticated;
grant all on scholar.self_assessments to service_role;

create policy "self_assessments: owner can select" on scholar.self_assessments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "self_assessments: owner can insert for own draft" on scholar.self_assessments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.drafts d where d.id = draft_id and d.user_id = (select auth.uid()))
  );
