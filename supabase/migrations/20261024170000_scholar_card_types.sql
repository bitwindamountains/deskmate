-- B-S2: the student picks which card types to make when importing (Q&A, cloze, "explain why"); generation reads it.
-- Shared project: touches only schema scholar.
alter table scholar.sources
  add column card_types text[] not null default array['basic', 'cloze', 'why']
  check (cardinality(card_types) between 1 and 3 and card_types <@ array['basic', 'cloze', 'why']);
grant insert (card_types) on scholar.sources to authenticated;
