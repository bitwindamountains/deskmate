-- Cap chunks per source and chunk size, so one quota charge cannot pay for thousands of LLM calls
-- through direct inserts (authenticated users may insert chunks into their own unpaid sources).
-- Matches the app limits in src/lib/import/validate.ts (MAX_CHUNKS, MAX_CHUNK_CHARS).
-- Shared project: touches only schema scholar.

alter table scholar.source_chunks
  add constraint source_chunks_position_range check (position between 0 and 29),
  add constraint source_chunks_text_length check (char_length(text) between 1 and 15000);
