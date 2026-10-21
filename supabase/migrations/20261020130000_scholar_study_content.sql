-- Study content: decks, sources, chunks, cards, call log, and the daily generation quota.
-- Shared project: touches only schemas scholar and scholar_private (never public, auth, rentflow, invoicetracker).
-- scholar_private is NOT added to Exposed schemas, so nothing in it is reachable through the Data API.

-- ---------------------------------------------------------------- decks
create table scholar.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  subject text,
  exam_date date,
  created_at timestamptz not null default now()
);
create index decks_user_id_idx on scholar.decks (user_id);
alter table scholar.decks enable row level security;

revoke all on scholar.decks from public, anon, authenticated;
grant select, insert, update, delete on scholar.decks to authenticated;
grant all on scholar.decks to service_role;

create policy "decks: owner can select" on scholar.decks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "decks: owner can insert" on scholar.decks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "decks: owner can update" on scholar.decks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "decks: owner can delete" on scholar.decks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- sources
create table scholar.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id uuid not null references scholar.decks (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('pdf', 'text')),
  page_count smallint not null check (page_count between 1 and 20),
  quota_consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sources_user_id_idx on scholar.sources (user_id);
create index sources_deck_id_idx on scholar.sources (deck_id);
alter table scholar.sources enable row level security;

-- Column-scoped insert: quota_consumed_at is set only by the quota function, never by the client
-- (a pre-set value would make consume_generation_quota return true without counting).
revoke all on scholar.sources from public, anon, authenticated;
grant select, delete on scholar.sources to authenticated;
grant insert (id, user_id, deck_id, title, kind, page_count) on scholar.sources to authenticated;
grant all on scholar.sources to service_role;

create policy "sources: owner can select" on scholar.sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sources: owner can insert into own deck" on scholar.sources
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.decks d where d.id = deck_id and d.user_id = (select auth.uid()))
  );
create policy "sources: owner can delete" on scholar.sources
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- source_chunks
create table scholar.source_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references scholar.sources (id) on delete cascade,
  position smallint not null,
  page_start smallint,
  page_end smallint,
  text text not null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, position) -- also serves as the (source_id, position) index
);
create index source_chunks_user_id_idx on scholar.source_chunks (user_id);
alter table scholar.source_chunks enable row level security;

revoke all on scholar.source_chunks from public, anon, authenticated;
-- Update is column-scoped to generated_at, and the policy below only lets it be set, never cleared:
-- clearing it (or adding chunks to a paid source) would let generation rerun under an already-paid source.
grant select, insert on scholar.source_chunks to authenticated;
grant update (generated_at) on scholar.source_chunks to authenticated;
grant all on scholar.source_chunks to service_role;

create policy "source_chunks: owner can select" on scholar.source_chunks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "source_chunks: owner can insert into own source" on scholar.source_chunks
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.sources s
                 where s.id = source_id and s.user_id = (select auth.uid()) and s.quota_consumed_at is null)
  );
create policy "source_chunks: owner can update" on scholar.source_chunks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and generated_at is not null
    and exists (select 1 from scholar.sources s where s.id = source_id and s.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- cards
create table scholar.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id uuid not null references scholar.decks (id) on delete cascade,
  source_chunk_id uuid references scholar.source_chunks (id) on delete set null,
  type text not null check (type in ('basic', 'cloze', 'why')),
  front text not null,
  back text not null,
  key_points text[] not null default '{}',
  source_quote text not null,
  concept text not null,
  bloom_level text not null,
  importance smallint not null check (importance between 1 and 3),
  status text not null default 'pending' check (status in ('pending', 'kept', 'discarded')),
  discard_reason text check (discard_reason in ('trivial', 'wrong', 'duplicate', 'unclear')),
  embedding real[],
  created_at timestamptz not null default now()
);
create index cards_user_id_idx on scholar.cards (user_id);
create index cards_deck_id_status_idx on scholar.cards (deck_id, status);
create index cards_source_chunk_id_idx on scholar.cards (source_chunk_id);
alter table scholar.cards enable row level security;

revoke all on scholar.cards from public, anon, authenticated;
grant select, insert, update, delete on scholar.cards to authenticated;
grant all on scholar.cards to service_role;

create policy "cards: owner can select" on scholar.cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cards: owner can insert into own deck" on scholar.cards
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.decks d where d.id = deck_id and d.user_id = (select auth.uid()))
    and (source_chunk_id is null
         or exists (select 1 from scholar.source_chunks c where c.id = source_chunk_id and c.user_id = (select auth.uid())))
  );
create policy "cards: owner can update" on scholar.cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.decks d where d.id = deck_id and d.user_id = (select auth.uid()))
    and (source_chunk_id is null
         or exists (select 1 from scholar.source_chunks c where c.id = source_chunk_id and c.user_id = (select auth.uid())))
  );
create policy "cards: owner can delete" on scholar.cards
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- llm_calls
create table scholar.llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  provider text not null,
  model text not null,
  status text not null,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index llm_calls_user_id_idx on scholar.llm_calls (user_id);
alter table scholar.llm_calls enable row level security;

revoke all on scholar.llm_calls from public, anon, authenticated;
grant select, insert on scholar.llm_calls to authenticated;
grant all on scholar.llm_calls to service_role;

create policy "llm_calls: owner can select" on scholar.llm_calls
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "llm_calls: owner can insert" on scholar.llm_calls
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- quota_usage
create table scholar.quota_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  generations smallint not null default 0,
  essays smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day) -- leading user_id covers the RLS predicate
);
alter table scholar.quota_usage enable row level security;

-- Read-only for users: only scholar_private.consume_generation_quota (security definer) writes it,
-- so a user cannot reset their own counter with a direct UPDATE.
revoke all on scholar.quota_usage from public, anon, authenticated;
grant select on scholar.quota_usage to authenticated;
grant all on scholar.quota_usage to service_role;

create policy "quota_usage: owner can select" on scholar.quota_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- quota function
create schema scholar_private; -- plain create: fail loudly rather than share an existing schema
revoke all on schema scholar_private from public, anon;
-- Ruling (ledgered): the scholar wrapper is security invoker, so the caller needs usage on scholar_private and
-- execute on the inner function to call it. scholar_private is not in Exposed schemas, so the API never reaches it directly.
grant usage on schema scholar_private to authenticated;

create function scholar_private.consume_generation_quota(p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant int := 3; -- not a parameter: authenticated can execute this function, so it must not set its own limit
  v_uid uuid := (select auth.uid());
  v_consumed_at timestamptz;
  v_rows int;
begin
  -- Ownership check; FOR UPDATE serializes concurrent calls for the same source (no double count).
  select s.quota_consumed_at into v_consumed_at
    from scholar.sources s
   where s.id = p_source_id and s.user_id = v_uid
   for update;
  if not found then
    raise exception 'source not found' using errcode = '42501';
  end if;

  if v_consumed_at is not null then
    return true; -- this source already paid
  end if;

  insert into scholar.quota_usage as q (user_id, day, generations)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set generations = q.generations + 1
    where q.generations < c_daily_limit;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  update scholar.sources set quota_consumed_at = now() where id = p_source_id;
  return true;
end;
$$;

revoke execute on function scholar_private.consume_generation_quota(uuid) from public, anon;
grant execute on function scholar_private.consume_generation_quota(uuid) to authenticated;

-- The only API entry point.
create function scholar.consume_generation_quota(p_source_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select scholar_private.consume_generation_quota(p_source_id);
$$;

revoke execute on function scholar.consume_generation_quota(uuid) from public, anon;
grant execute on function scholar.consume_generation_quota(uuid) to authenticated;
