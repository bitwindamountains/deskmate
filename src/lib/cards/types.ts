/**
 * Card types (B2.3). All are question-and-answer shaped, so review, grading, editing and export treat them alike.
 * The first three are the MVP set and the default for imports; the rest are Phase 2.
 */
export const CARD_TYPES = ['basic', 'cloze', 'why', 'application', 'compare', 'sequence'] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const DEFAULT_CARD_TYPES: CardType[] = ['basic', 'cloze', 'why'];

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  basic: 'Q&A', cloze: 'Fill in the blank', why: 'Why', application: 'Apply it', compare: 'Compare', sequence: 'Put in order',
};

/** Answers that explain rather than recall: always graded by the AI, and short-answer in practice tests. */
export const EXPLAIN_TYPES: CardType[] = ['why', 'application', 'compare'];
