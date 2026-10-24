-- Lets the keep-alive cron (no user) reach scholar.ping(). Checked on 2026-10-24: anon has no table or column grants
-- in scholar, and ping is the only function it may execute. Every scholar function must keep revoking execute from public.
grant usage on schema scholar to anon;
