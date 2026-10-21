-- Review loop: per-card FSRS state, the review log, the grade cache, and the idempotent record_review.
-- Shared project: touches only schemas scholar and scholar_private (never public, auth, rentflow, invoicetracker).
-- Users never write card_states or reviews directly; scholar_private.record_review (security definer) is the only writer.

-- ---------------------------------------------------------------- card_states
create table scholar.card_states (
  card_id uuid primary key references scholar.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  due timestamptz not null,
  stability real not null check (stability >= 0),
  difficulty real not null check (difficulty >= 0),
  scheduled_days int not null check (scheduled_days >= 0),
  learning_steps int not null check (learning_steps >= 0),
  reps int not null check (reps >= 0),
  lapses int not null check (lapses >= 0),
  state smallint not null check (state between 0 and 3),
  last_review timestamptz
);
create index card_states_user_id_due_idx on scholar.card_states (user_id, due); -- leading user_id covers the RLS predicate
alter table scholar.card_states enable row level security;

revoke all on scholar.card_states from public, anon, authenticated;
grant select on scholar.card_states to authenticated;
grant all on scholar.card_states to service_role;

create policy "card_states: owner can select" on scholar.card_states
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- reviews
create table scholar.reviews (
  id uuid primary key default gen_random_uuid(),
  client_review_id uuid not null unique,
  card_id uuid not null references scholar.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer_text text check (char_length(answer_text) <= 2000),
  grade_source text not null check (grade_source in ('exact', 'fuzzy', 'embedding', 'llm', 'self')),
  ai_score real check (ai_score between 0 and 1),
  suggested_rating smallint check (suggested_rating between 1 and 4),
  final_rating smallint not null check (final_rating between 1 and 4),
  response_ms int check (response_ms between 0 and 3600000),
  reviewed_at timestamptz not null
);
create index reviews_user_id_idx on scholar.reviews (user_id);
create index reviews_card_id_idx on scholar.reviews (card_id);
alter table scholar.reviews enable row level security;

revoke all on scholar.reviews from public, anon, authenticated;
grant select on scholar.reviews to authenticated;
grant all on scholar.reviews to service_role;

create policy "reviews: owner can select" on scholar.reviews
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- grade_cache
create table scholar.grade_cache (
  card_id uuid not null references scholar.cards (id) on delete cascade,
  answer_hash text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (card_id, answer_hash)
);
create index grade_cache_user_id_idx on scholar.grade_cache (user_id);
alter table scholar.grade_cache enable row level security;

revoke all on scholar.grade_cache from public, anon, authenticated;
grant select, insert on scholar.grade_cache to authenticated;
grant all on scholar.grade_cache to service_role;

create policy "grade_cache: owner can select" on scholar.grade_cache
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "grade_cache: owner can insert for own card" on scholar.grade_cache
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.cards c where c.id = card_id and c.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- record_review
create function scholar_private.record_review(p_review jsonb, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max_ts timestamptz := now() + interval '5 minutes';
  v_client_review_id uuid;
  v_card_id uuid;
  v_answer_text text;
  v_grade_source text;
  v_ai_score real;
  v_suggested_rating int;
  v_final_rating int;
  v_response_ms int;
  v_reviewed_at timestamptz;
  v_state_card_id uuid;
  v_due timestamptz;
  v_stability real;
  v_difficulty real;
  v_scheduled_days int;
  v_learning_steps int;
  v_reps int;
  v_lapses int;
  v_state int;
  v_last_review timestamptz;
begin
  -- JSON types first: a number field must be a JSON number (so never NaN/Infinity), a text/uuid/timestamp field a JSON string.
  if jsonb_typeof(p_review) is distinct from 'object' or jsonb_typeof(p_state) is distinct from 'object'
     or exists (
       select 1 from (values
         ('r', 'client_review_id', 'string', false), ('r', 'card_id', 'string', false),
         ('r', 'answer_text', 'string', true), ('r', 'grade_source', 'string', false),
         ('r', 'ai_score', 'number', true), ('r', 'suggested_rating', 'number', true),
         ('r', 'final_rating', 'number', false), ('r', 'response_ms', 'number', true),
         ('r', 'reviewed_at', 'string', false),
         ('s', 'card_id', 'string', false), ('s', 'due', 'string', false),
         ('s', 'stability', 'number', false), ('s', 'difficulty', 'number', false),
         ('s', 'scheduled_days', 'number', false), ('s', 'learning_steps', 'number', false),
         ('s', 'reps', 'number', false), ('s', 'lapses', 'number', false),
         ('s', 'state', 'number', false), ('s', 'last_review', 'string', false)
       ) as f(src, k, t, nullable)
       cross join lateral (select coalesce(jsonb_typeof(case f.src when 'r' then p_review else p_state end -> f.k), 'null') as jt) j
       where j.jt <> f.t and not (f.nullable and j.jt = 'null')
     ) then
    raise exception 'invalid review payload' using errcode = '22023';
  end if;

  -- Casts: bad uuid/timestamp syntax, fractional ints, or out-of-range numbers all become invalid_parameter_value.
  begin
    v_client_review_id := (p_review ->> 'client_review_id')::uuid;
    v_card_id := (p_review ->> 'card_id')::uuid;
    v_answer_text := p_review ->> 'answer_text';
    v_grade_source := p_review ->> 'grade_source';
    v_ai_score := (p_review ->> 'ai_score')::real;
    v_suggested_rating := (p_review ->> 'suggested_rating')::int;
    v_final_rating := (p_review ->> 'final_rating')::int;
    v_response_ms := (p_review ->> 'response_ms')::int;
    v_reviewed_at := (p_review ->> 'reviewed_at')::timestamptz;
    v_state_card_id := (p_state ->> 'card_id')::uuid;
    v_due := (p_state ->> 'due')::timestamptz;
    v_stability := (p_state ->> 'stability')::real;
    v_difficulty := (p_state ->> 'difficulty')::real;
    v_scheduled_days := (p_state ->> 'scheduled_days')::int;
    v_learning_steps := (p_state ->> 'learning_steps')::int;
    v_reps := (p_state ->> 'reps')::int;
    v_lapses := (p_state ->> 'lapses')::int;
    v_state := (p_state ->> 'state')::int;
    v_last_review := (p_state ->> 'last_review')::timestamptz;
  exception when others then
    raise exception 'invalid review payload' using errcode = '22023';
  end;

  if v_state_card_id <> v_card_id
     or char_length(v_answer_text) > 2000
     or v_grade_source not in ('exact', 'fuzzy', 'embedding', 'llm', 'self')
     or v_ai_score not between 0 and 1
     or v_suggested_rating not between 1 and 4
     or v_final_rating not between 1 and 4
     or v_response_ms not between 0 and 3600000
     or not isfinite(v_reviewed_at) or v_reviewed_at > v_max_ts
     or not isfinite(v_last_review) or v_last_review > v_max_ts
     or not isfinite(v_due)
     or v_stability < 0 or v_difficulty < 0
     or v_scheduled_days < 0 or v_learning_steps < 0 or v_reps < 0 or v_lapses < 0
     or v_state not between 0 and 3 then
    raise exception 'invalid review payload' using errcode = '22023';
  end if;

  -- Ownership check: the card must be the caller's.
  if not exists (select 1 from scholar.cards c where c.id = v_card_id and c.user_id = v_uid) then
    raise exception 'card not found' using errcode = '42501';
  end if;

  insert into scholar.reviews (client_review_id, card_id, user_id, answer_text, grade_source, ai_score,
                               suggested_rating, final_rating, response_ms, reviewed_at)
  values (v_client_review_id, v_card_id, v_uid, v_answer_text, v_grade_source, v_ai_score,
          v_suggested_rating, v_final_rating, v_response_ms, v_reviewed_at)
  on conflict (client_review_id) do nothing;

  -- Only a strictly later review moves the state (an out-of-order or replayed sync never rewinds it).
  insert into scholar.card_states as cs (card_id, user_id, due, stability, difficulty, scheduled_days,
                                         learning_steps, reps, lapses, state, last_review)
  values (v_card_id, v_uid, v_due, v_stability, v_difficulty, v_scheduled_days,
          v_learning_steps, v_reps, v_lapses, v_state, v_last_review)
  on conflict (card_id) do update
    set due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
        scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps,
        reps = excluded.reps, lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review
    where cs.last_review is null or excluded.last_review > cs.last_review;
end;
$$;

revoke execute on function scholar_private.record_review(jsonb, jsonb) from public, anon;
grant execute on function scholar_private.record_review(jsonb, jsonb) to authenticated;

-- The only API entry point.
create function scholar.record_review(p_review jsonb, p_state jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select scholar_private.record_review(p_review, p_state);
$$;

revoke execute on function scholar.record_review(jsonb, jsonb) from public, anon;
grant execute on function scholar.record_review(jsonb, jsonb) to authenticated;
