-- Draft Coach: essays, drafts, analyses, feedback items and events, the daily essay quota, and the rewrite cap.
-- Shared project: touches only schemas scholar and scholar_private (never public, auth, rentflow, invoicetracker).
-- Anything that gates an LLM call (layer state, hint levels 3-4, rewrites, quota) changes only through scholar_private
-- security-definer functions with one-way transitions, so a user cannot reset it through the API and re-run calls for free.

-- ---------------------------------------------------------------- essays
create table scholar.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  essay_type text not null check (essay_type in ('argumentative', 'expository', 'narrative', 'compare-contrast', 'research', 'personal-statement')),
  grade_level text not null default 'college' check (char_length(grade_level) between 1 and 40),
  assignment_prompt text check (char_length(assignment_prompt) <= 4000),
  citation_style text check (char_length(citation_style) <= 40),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index essays_user_id_idx on scholar.essays (user_id);
alter table scholar.essays enable row level security;

revoke all on scholar.essays from public, anon, authenticated;
grant select, insert, delete on scholar.essays to authenticated;
grant update (title, essay_type, grade_level, assignment_prompt, citation_style, updated_at) on scholar.essays to authenticated;
grant all on scholar.essays to service_role;

create policy "essays: owner can select" on scholar.essays
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "essays: owner can insert" on scholar.essays
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "essays: owner can update" on scholar.essays
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "essays: owner can delete" on scholar.essays
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- drafts
create table scholar.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  essay_id uuid not null references scholar.essays (id) on delete cascade,
  version smallint not null check (version >= 1),
  content text not null check (char_length(content) <= 20000),
  word_count int not null check (word_count >= 0),
  paragraph_hashes text[] not null,
  layers jsonb not null default '{}',
  quota_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (essay_id, version)
);
create index drafts_user_id_idx on scholar.drafts (user_id);
alter table scholar.drafts enable row level security;

-- No update grant: a draft's text is fixed once saved (a revision is a new version), and layers/quota move only through functions.
revoke all on scholar.drafts from public, anon, authenticated;
grant select on scholar.drafts to authenticated;
grant insert (id, user_id, essay_id, version, content, word_count, paragraph_hashes) on scholar.drafts to authenticated;
grant all on scholar.drafts to service_role;

create policy "drafts: owner can select" on scholar.drafts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "drafts: owner can insert into own essay" on scholar.drafts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.essays e where e.id = essay_id and e.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- analyses
create table scholar.analyses (
  draft_id uuid primary key references scholar.drafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rubric_scores jsonb not null,
  strengths jsonb not null,
  safety_concern boolean not null default false,
  created_at timestamptz not null default now()
);
create index analyses_user_id_idx on scholar.analyses (user_id);
alter table scholar.analyses enable row level security;

revoke all on scholar.analyses from public, anon, authenticated;
grant select, insert on scholar.analyses to authenticated;
grant all on scholar.analyses to service_role;

create policy "analyses: owner can select" on scholar.analyses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "analyses: owner can insert for own draft" on scholar.analyses
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.drafts d where d.id = draft_id and d.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- feedback_items
create table scholar.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null references scholar.drafts (id) on delete cascade,
  layer text not null check (layer in ('global', 'paragraph', 'sentence')),
  category text not null check (char_length(category) <= 60),
  rubric_criterion text check (char_length(rubric_criterion) <= 60),
  paragraph_index smallint check (paragraph_index >= 0),
  quote text check (char_length(quote) <= 1000),
  anchor_start int check (anchor_start >= 0),
  anchor_end int check (anchor_end >= anchor_start),
  severity text not null check (severity in ('low', 'medium', 'high')),
  summary text not null check (char_length(summary) <= 1000),
  hints text[] not null default '{}' check (cardinality(hints) <= 4), -- index = level - 1, levels 1-4
  rewrite text check (char_length(rewrite) <= 2000),
  replacements text[] not null default '{}' check (cardinality(replacements) <= 3),
  convention boolean not null default false,
  source text not null check (source in ('llm', 'languagetool')),
  status text not null default 'open' check (status in ('open', 'partial', 'addressed', 'got_it', 'disputed')),
  dispute_reason text check (char_length(dispute_reason) <= 1000),
  highest_level smallint not null default 0 check (highest_level between 0 and 5),
  carried_from_id uuid references scholar.feedback_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index feedback_items_user_id_idx on scholar.feedback_items (user_id);
create index feedback_items_draft_id_idx on scholar.feedback_items (draft_id);
create index feedback_items_carried_from_id_idx on scholar.feedback_items (carried_from_id); -- FK; on delete set null scans it
alter table scholar.feedback_items enable row level security;

-- rewrite and hints 3-4 are absent from the update grant: they are written once, through functions below.
revoke all on scholar.feedback_items from public, anon, authenticated;
grant select, insert on scholar.feedback_items to authenticated;
grant update (status, dispute_reason, highest_level) on scholar.feedback_items to authenticated;
grant all on scholar.feedback_items to service_role;

create policy "feedback_items: owner can select" on scholar.feedback_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "feedback_items: owner can insert for own draft" on scholar.feedback_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.drafts d where d.id = draft_id and d.user_id = (select auth.uid()))
  );
create policy "feedback_items: owner can update" on scholar.feedback_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- feedback_events
create table scholar.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references scholar.feedback_items (id) on delete cascade,
  action text not null check (action in ('viewed_level', 'got_it', 'disagree', 'rewrite')),
  level smallint check (level between 1 and 5),
  created_at timestamptz not null default now()
);
create index feedback_events_user_id_idx on scholar.feedback_events (user_id);
create index feedback_events_item_id_idx on scholar.feedback_events (item_id);
alter table scholar.feedback_events enable row level security;

revoke all on scholar.feedback_events from public, anon, authenticated;
grant select, insert on scholar.feedback_events to authenticated;
grant all on scholar.feedback_events to service_role;

create policy "feedback_events: owner can select" on scholar.feedback_events
  for select to authenticated using ((select auth.uid()) = user_id);
-- 'rewrite' events count against the per-draft cap, so only reserve_rewrite may insert them.
create policy "feedback_events: owner can insert for own item" on scholar.feedback_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and action <> 'rewrite'
    and exists (select 1 from scholar.feedback_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- essay quota
create function scholar_private.consume_essay_quota(p_draft_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant int := 5; -- spec §6.5; a constant, not a parameter the caller could raise
  v_uid uuid := (select auth.uid());
  v_consumed_at timestamptz;
  v_rows int;
begin
  -- Ownership check; FOR UPDATE serializes concurrent calls for the same draft (no double count).
  select d.quota_consumed_at into v_consumed_at
    from scholar.drafts d
   where d.id = p_draft_id and d.user_id = v_uid
   for update;
  if not found then
    raise exception 'draft not found' using errcode = '42501';
  end if;

  if v_consumed_at is not null then
    return true; -- this draft already paid
  end if;

  insert into scholar.quota_usage as q (user_id, day, essays)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set essays = q.essays + 1
    where q.essays < c_daily_limit;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  update scholar.drafts set quota_consumed_at = now() where id = p_draft_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------- layer state
-- A layer is null (never run), 'running', 'failed', or 'done'. Claim: null|failed -> running. Finish: running -> done|failed.
-- 'done' is final, so a finished layer can never be re-run.
create function scholar_private.claim_layer(p_draft_id uuid, p_layer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_layers jsonb;
begin
  if p_layer not in ('global', 'paragraphs', 'sentences') then
    raise exception 'invalid layer' using errcode = '22023';
  end if;
  select d.layers into v_layers from scholar.drafts d where d.id = p_draft_id and d.user_id = v_uid for update;
  if not found then
    raise exception 'draft not found' using errcode = '42501';
  end if;
  if coalesce(v_layers ->> p_layer, 'failed') <> 'failed' then
    return false;
  end if;
  update scholar.drafts set layers = v_layers || jsonb_build_object(p_layer, 'running') where id = p_draft_id;
  return true;
end;
$$;

create function scholar_private.finish_layer(p_draft_id uuid, p_layer text, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_layers jsonb;
begin
  if p_layer not in ('global', 'paragraphs', 'sentences') or p_status not in ('done', 'failed') then
    raise exception 'invalid layer status' using errcode = '22023';
  end if;
  select d.layers into v_layers from scholar.drafts d where d.id = p_draft_id and d.user_id = v_uid for update;
  if not found then
    raise exception 'draft not found' using errcode = '42501';
  end if;
  if v_layers ->> p_layer is distinct from 'running' then
    return false;
  end if;
  update scholar.drafts set layers = v_layers || jsonb_build_object(p_layer, p_status) where id = p_draft_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------- hints and rewrites
create function scholar_private.save_hint_levels(p_item_id uuid, p_explanation text, p_example text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hints text[];
begin
  if char_length(p_explanation) not between 1 and 2000 or char_length(p_example) not between 1 and 2000 then
    raise exception 'invalid hint' using errcode = '22023';
  end if;
  select i.hints into v_hints from scholar.feedback_items i where i.id = p_item_id and i.user_id = v_uid for update;
  if not found then
    raise exception 'item not found' using errcode = '42501';
  end if;
  if cardinality(v_hints) >= 3 then
    return false; -- levels 3-4 already saved
  end if;
  -- Pad missing levels 1-2 so the new text always lands at levels 3 and 4.
  update scholar.feedback_items
     set hints = (v_hints || array_fill(''::text, array[2 - cardinality(v_hints)]))[1:2] || array[p_explanation, p_example]
   where id = p_item_id;
  return true;
end;
$$;

create function scholar_private.reserve_rewrite(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_cap constant int := 3; -- brief A2.5: rewrites per draft
  v_uid uuid := (select auth.uid());
  v_draft uuid;
  v_used int;
begin
  select i.draft_id into v_draft from scholar.feedback_items i where i.id = p_item_id and i.user_id = v_uid;
  if not found then
    raise exception 'item not found' using errcode = '42501';
  end if;
  -- Lock the draft so two parallel reservations cannot both see the last free slot.
  perform 1 from scholar.drafts d where d.id = v_draft for update;
  select count(*) into v_used
    from scholar.feedback_events e join scholar.feedback_items i on i.id = e.item_id
   where i.draft_id = v_draft and e.action = 'rewrite';
  if v_used >= c_cap then
    return false;
  end if;
  insert into scholar.feedback_events (user_id, item_id, action, level) values (v_uid, p_item_id, 'rewrite', 5);
  return true;
end;
$$;

create function scholar_private.save_rewrite(p_item_id uuid, p_rewrite text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rows int;
begin
  if char_length(p_rewrite) not between 1 and 2000 then
    raise exception 'invalid rewrite' using errcode = '22023';
  end if;
  if not exists (select 1 from scholar.feedback_items i where i.id = p_item_id and i.user_id = v_uid) then
    raise exception 'item not found' using errcode = '42501';
  end if;
  update scholar.feedback_items set rewrite = p_rewrite where id = p_item_id and rewrite is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- ---------------------------------------------------------------- grants and API wrappers
revoke execute on function scholar_private.consume_essay_quota(uuid) from public, anon;
revoke execute on function scholar_private.claim_layer(uuid, text) from public, anon;
revoke execute on function scholar_private.finish_layer(uuid, text, text) from public, anon;
revoke execute on function scholar_private.save_hint_levels(uuid, text, text) from public, anon;
revoke execute on function scholar_private.reserve_rewrite(uuid) from public, anon;
revoke execute on function scholar_private.save_rewrite(uuid, text) from public, anon;
grant execute on function scholar_private.consume_essay_quota(uuid) to authenticated;
grant execute on function scholar_private.claim_layer(uuid, text) to authenticated;
grant execute on function scholar_private.finish_layer(uuid, text, text) to authenticated;
grant execute on function scholar_private.save_hint_levels(uuid, text, text) to authenticated;
grant execute on function scholar_private.reserve_rewrite(uuid) to authenticated;
grant execute on function scholar_private.save_rewrite(uuid, text) to authenticated;

create function scholar.consume_essay_quota(p_draft_id uuid) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.consume_essay_quota(p_draft_id); $$;
create function scholar.claim_layer(p_draft_id uuid, p_layer text) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.claim_layer(p_draft_id, p_layer); $$;
create function scholar.finish_layer(p_draft_id uuid, p_layer text, p_status text) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.finish_layer(p_draft_id, p_layer, p_status); $$;
create function scholar.save_hint_levels(p_item_id uuid, p_explanation text, p_example text) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.save_hint_levels(p_item_id, p_explanation, p_example); $$;
create function scholar.reserve_rewrite(p_item_id uuid) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.reserve_rewrite(p_item_id); $$;
create function scholar.save_rewrite(p_item_id uuid, p_rewrite text) returns boolean
language sql security invoker set search_path = '' as $$ select scholar_private.save_rewrite(p_item_id, p_rewrite); $$;

revoke execute on function scholar.consume_essay_quota(uuid) from public, anon;
revoke execute on function scholar.claim_layer(uuid, text) from public, anon;
revoke execute on function scholar.finish_layer(uuid, text, text) from public, anon;
revoke execute on function scholar.save_hint_levels(uuid, text, text) from public, anon;
revoke execute on function scholar.reserve_rewrite(uuid) from public, anon;
revoke execute on function scholar.save_rewrite(uuid, text) from public, anon;
grant execute on function scholar.consume_essay_quota(uuid) to authenticated;
grant execute on function scholar.claim_layer(uuid, text) to authenticated;
grant execute on function scholar.finish_layer(uuid, text, text) to authenticated;
grant execute on function scholar.save_hint_levels(uuid, text, text) to authenticated;
grant execute on function scholar.reserve_rewrite(uuid) to authenticated;
grant execute on function scholar.save_rewrite(uuid, text) to authenticated;
