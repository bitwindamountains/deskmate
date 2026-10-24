-- B3.1 question rephrasing: a card keeps up to 3 rewordings of its question (same answer), made on request and reused.
-- Adds a column; no data changes. Update on scholar.cards is already granted to the owner through RLS.
-- Shared project: touches only schema scholar.
alter table scholar.cards add column variants text[] not null default '{}'
  check (cardinality(variants) <= 3 and char_length(array_to_string(variants, '')) <= 1500);
