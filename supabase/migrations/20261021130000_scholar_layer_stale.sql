-- A layer left 'running' by a request the platform killed mid-call could never be claimed again, so that draft's
-- feedback was stuck for good. A claim now takes over a 'running' layer whose claim is older than 5 minutes
-- (every LLM and LanguageTool call times out well before that). The claim time is kept in layers.<layer>_at.
-- Shared project: touches only schema scholar_private.

create or replace function scholar_private.claim_layer(p_draft_id uuid, p_layer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_layers jsonb;
  v_state text;
begin
  if p_layer not in ('global', 'paragraphs', 'sentences') then
    raise exception 'invalid layer' using errcode = '22023';
  end if;
  select d.layers into v_layers from scholar.drafts d where d.id = p_draft_id and d.user_id = v_uid for update;
  if not found then
    raise exception 'draft not found' using errcode = '42501';
  end if;
  v_state := v_layers ->> p_layer;
  if v_state = 'done'
     or (v_state = 'running' and coalesce((v_layers ->> (p_layer || '_at'))::timestamptz, '-infinity') > now() - interval '5 minutes') then
    return false;
  end if;
  update scholar.drafts
     set layers = v_layers || jsonb_build_object(p_layer, 'running', p_layer || '_at', now())
   where id = p_draft_id;
  return true;
end;
$$;
