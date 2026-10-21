-- Phase 2a (Recall depth): suspended cards, an optional confidence level on reviews, and a cache for card help.
-- Shared project: touches only schemas scholar and scholar_private (never public, auth, rentflow, invoicetracker).

-- ---------------------------------------------------------------- suspended cards
-- A suspended card keeps its card_states row, so unsuspending resumes its schedule instead of resetting it.
alter table scholar.cards drop constraint cards_status_check;
alter table scholar.cards add constraint cards_status_check check (status in ('pending', 'kept', 'discarded', 'suspended'));

-- ---------------------------------------------------------------- review confidence (B3.2)
-- Guessing 1, Unsure 2, Confident 3. Optional: reviews queued on a device before this release have no confidence field.
alter table scholar.reviews add column confidence smallint check (confidence between 1 and 3);

-- Same function as 20261020150000_scholar_review.sql, plus the optional confidence field. Grants are unchanged by replace.
create or replace function scholar_private.record_review(p_review jsonb, p_state jsonb)
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
  v_confidence int;
begin
  -- JSON types first: a number field must be a JSON number (so never NaN/Infinity), a text/uuid/timestamp field a JSON string.
  if jsonb_typeof(p_review) is distinct from 'object' or jsonb_typeof(p_state) is distinct from 'object'
     or exists (
       select 1 from (values
         ('r', 'client_review_id', 'string', false), ('r', 'card_id', 'string', false),
         ('r', 'answer_text', 'string', true), ('r', 'grade_source', 'string', false),
         ('r', 'ai_score', 'number', true), ('r', 'suggested_rating', 'number', true),
         ('r', 'final_rating', 'number', false), ('r', 'response_ms', 'number', true),
         ('r', 'reviewed_at', 'string', false), ('r', 'confidence', 'number', true),
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
    v_confidence := (p_review ->> 'confidence')::int;
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
     or v_confidence not between 1 and 3
     or v_state not between 0 and 3 then
    raise exception 'invalid review payload' using errcode = '22023';
  end if;

  -- Ownership check: the card must be the caller's.
  if not exists (select 1 from scholar.cards c where c.id = v_card_id and c.user_id = v_uid) then
    raise exception 'card not found' using errcode = '42501';
  end if;

  insert into scholar.reviews (client_review_id, card_id, user_id, answer_text, grade_source, ai_score,
                               suggested_rating, final_rating, response_ms, reviewed_at, confidence)
  values (v_client_review_id, v_card_id, v_uid, v_answer_text, v_grade_source, v_ai_score,
          v_suggested_rating, v_final_rating, v_response_ms, v_reviewed_at, v_confidence)
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

-- ---------------------------------------------------------------- card help cache (B3.3, B3.8)
create table scholar.card_aids (
  card_id uuid primary key references scholar.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index card_aids_user_id_idx on scholar.card_aids (user_id);
alter table scholar.card_aids enable row level security;

-- Written once per card and never updated, so a cached help result cannot be swapped for one that skips the quota.
revoke all on scholar.card_aids from public, anon, authenticated;
grant select, insert on scholar.card_aids to authenticated;
grant all on scholar.card_aids to service_role;

create policy "card_aids: owner can select" on scholar.card_aids
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "card_aids: owner can insert for own card" on scholar.card_aids
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from scholar.cards c where c.id = card_id and c.user_id = (select auth.uid()))
  );
