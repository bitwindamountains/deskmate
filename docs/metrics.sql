-- Success metrics (brief Part F), read-only. Run in the Supabase SQL editor; each query stands alone.
-- Shared project: these read only schema scholar. Counts cover every student; add `where user_id = '…'` to look at one.
-- Not measurable yet: teacher metrics (no teacher features), daily review completion (no record of what was due each day),
-- card edit rate (edits aren't logged), and readiness forecast vs. real exam results (needs student reports).

-- ===================================================================== F1 Draft Coach
-- North star: essays revised at least once whose average rubric score went up from the first draft to the latest.
with scored as (
  select d.essay_id, d.version, avg((s->>'score')::numeric) as avg_score
  from scholar.drafts d
  join scholar.analyses a on a.draft_id = d.id
  cross join lateral jsonb_array_elements(a.rubric_scores) s
  group by d.essay_id, d.version
), ends as (
  select essay_id,
    (array_agg(avg_score order by version))[1] as first_score,
    (array_agg(avg_score order by version desc))[1] as last_score,
    count(*) as drafts
  from scored group by essay_id
)
select count(*) filter (where drafts > 1) as revised_essays,
  count(*) filter (where drafts > 1 and last_score > first_score) as revised_and_improved,
  round(100.0 * count(*) filter (where drafts > 1 and last_score > first_score) / nullif(count(*) filter (where drafts > 1), 0), 1) as pct_improved
from ends;

-- Feedback items addressed per draft (re-check marked addressed or partial, or the student said Got it).
select round(avg(n), 2) as addressed_per_draft from (
  select draft_id, count(*) filter (where status in ('addressed', 'partial', 'got_it')) as n
  from scholar.feedback_items where source = 'llm' group by draft_id
) t;

-- Average hint level needed, by week (falling = growing independence).
select date_trunc('week', created_at) as week, round(avg(highest_level), 2) as avg_hint_level, count(*) as items_opened
from scholar.feedback_items where highest_level >= 1 group by 1 order by 1;

-- Dispute rate, and how disputes ended (keep / modify / withdraw).
select round(100.0 * count(*) filter (where status = 'disputed' or dispute_reason is not null) / nullif(count(*), 0), 1) as dispute_pct
from scholar.feedback_items where source = 'llm';
select verdict, count(*) from scholar.feedback_messages where role = 'coach' and kind = 'dispute' group by verdict;

-- 30-day retention: students active (a draft or a review) 30+ days after their first activity.
with activity as (
  select user_id, created_at as at from scholar.drafts
  union all select user_id, reviewed_at from scholar.reviews
), firsts as (select user_id, min(at) as first_at from activity group by user_id)
select count(*) as students,
  count(*) filter (where exists (select 1 from activity a where a.user_id = f.user_id and a.at >= f.first_at + interval '30 days')) as active_after_30_days
from firsts f where f.first_at <= now() - interval '30 days';

-- ===================================================================== F2 Recall
-- Time to first card: from saving the material to the first generated card, per source.
select percentile_cont(0.5) within group (order by secs) as median_seconds, max(secs) as worst_seconds, count(*) as sources from (
  select extract(epoch from min(c.created_at) - s.created_at) as secs
  from scholar.sources s
  join scholar.source_chunks ch on ch.source_id = s.id
  join scholar.cards c on c.source_chunk_id = ch.id
  group by s.id, s.created_at
) t;

-- Triage keep rate for generated cards, and the discard reasons.
select round(100.0 * count(*) filter (where status in ('kept', 'suspended')) / nullif(count(*) filter (where status <> 'pending'), 0), 1) as keep_pct
from scholar.cards where source_chunk_id is not null;
select discard_reason, count(*) from scholar.cards where status = 'discarded' group by 1 order by 2 desc;

-- "Report a problem" rate per 100 kept cards, and the reasons.
select round(100.0 * (select count(*) from scholar.problem_reports where target = 'card')
  / nullif((select count(*) from scholar.cards where status in ('kept', 'suspended')), 0), 2) as reports_per_100_cards;
select target, reason, count(*) from scholar.problem_reports group by 1, 2 order by 3 desc;

-- Grading override rate: the student chose a different rating than the grader suggested.
select grade_source, count(*) as graded,
  round(100.0 * count(*) filter (where final_rating <> suggested_rating) / nullif(count(*), 0), 1) as override_pct
from scholar.reviews where suggested_rating is not null group by 1;

-- Review formats (plan 2026-10-25-review-formats.md): how often each format is used and how often it ends in Again.
-- choice/blank/reverse are the formats; every other source is typed recall or "Show answer".
select case when grade_source in ('choice', 'blank', 'reverse') then grade_source else 'typed' end as format, count(*) as reviews,
  round(100.0 * count(*) filter (where final_rating = 1) / nullif(count(*), 0), 1) as again_pct
from scholar.reviews group by 1 order by 2 desc;

-- Leech rate: reviewed cards forgotten 4+ times (brief B3.3).
select round(100.0 * count(*) filter (where lapses >= 4) / nullif(count(*), 0), 1) as leech_pct from scholar.card_states where reps > 0;

-- True retention: share of reviews of mature cards (last interval 21+ days) not rated Again.
select round(100.0 * count(*) filter (where r.final_rating > 1) / nullif(count(*), 0), 1) as true_retention_pct
from scholar.reviews r join scholar.card_states s on s.card_id = r.card_id where s.scheduled_days >= 21;

-- 7-day retention: students who reviewed again 7+ days after their first review.
with firsts as (select user_id, min(reviewed_at) as first_at from scholar.reviews group by user_id)
select count(*) as students,
  count(*) filter (where exists (select 1 from scholar.reviews r where r.user_id = f.user_id and r.reviewed_at >= f.first_at + interval '7 days')) as back_after_7_days
from firsts f where f.first_at <= now() - interval '7 days';

-- ===================================================================== AI capacity (free tier)
-- Calls by task and outcome over the last 7 days; a rising rate_limited share means Groq's free limits are close.
select task, status, count(*) from scholar.llm_calls where created_at > now() - interval '7 days' group by 1, 2 order by 1, 3 desc;
