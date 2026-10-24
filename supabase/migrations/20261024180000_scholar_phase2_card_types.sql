-- B2.3 Phase 2 card types: application (scenario), compare and sequence join basic, cloze and why. All are
-- question-and-answer shaped. Widens two checks; no data changes. Shared project: touches only schema scholar.
alter table scholar.cards drop constraint cards_type_check;
alter table scholar.cards add constraint cards_type_check
  check (type in ('basic', 'cloze', 'why', 'application', 'compare', 'sequence'));

alter table scholar.sources drop constraint sources_card_types_check;
alter table scholar.sources add constraint sources_card_types_check
  check (cardinality(card_types) between 1 and 6
    and card_types <@ array['basic', 'cloze', 'why', 'application', 'compare', 'sequence']);
