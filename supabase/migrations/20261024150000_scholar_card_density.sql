-- B2.2: the student picks fewer, standard or more cards when importing; generation reads it from the source.
-- Shared project: touches only schema scholar.
alter table scholar.sources
  add column card_density text not null default 'standard' check (card_density in ('fewer', 'standard', 'more'));
grant insert (card_density) on scholar.sources to authenticated;
