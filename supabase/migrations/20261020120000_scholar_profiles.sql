-- Scholar profiles. Shared project: touches only schema scholar (never public, auth, rentflow, invoicetracker).
-- No trigger on auth.users (it would create rows for other apps' signups): each user inserts their own row on first visit.
-- Owner step outside SQL: add scholar to Exposed schemas (Settings -> Data API).

create schema scholar;
grant usage on schema scholar to authenticated, service_role; -- never anon

create table scholar.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  adult_attested_at timestamptz,
  first_language text check (first_language is null or char_length(first_language) <= 60),
  study_minutes_per_day smallint not null default 20 check (study_minutes_per_day between 5 and 120),
  preferences jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_onboarding_needs_attestation check (onboarded_at is null or adult_attested_at is not null)
);

alter table scholar.profiles enable row level security;

-- Column-scoped grants: users may insert only user_id (defaults fill the rest, so no pre-attested rows)
-- and may never update user_id or created_at.
revoke all on scholar.profiles from public, anon, authenticated;
grant select on scholar.profiles to authenticated;
grant insert (user_id) on scholar.profiles to authenticated;
grant update (display_name, first_language, study_minutes_per_day, preferences, adult_attested_at, onboarded_at)
  on scholar.profiles to authenticated;
grant all on scholar.profiles to service_role;

create policy "profiles: owner can select" on scholar.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: owner can insert own row" on scholar.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles: owner can update" on scholar.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: rows go away with the auth user (FK cascade).
