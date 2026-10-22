export type PatternKey = 'vague_thesis' | 'weak_topic_sentence' | 'unsupported_claim' | 'missing_analysis' | 'weak_transitions'
  | 'over_quoting' | 'citation' | 'comma_splice' | 'run_on' | 'spelling' | 'grammar' | 'punctuation';

/** The growth profile's fixed pattern list (A3.5), in display order. */
export const PATTERNS: Record<PatternKey, string> = {
  vague_thesis: 'Thesis needs focus',
  weak_topic_sentence: 'Weak topic sentences',
  unsupported_claim: 'Claims without evidence',
  missing_analysis: 'Evidence not explained',
  weak_transitions: 'Missing transitions',
  over_quoting: 'Over-quoting',
  citation: 'Citations',
  comma_splice: 'Comma splices',
  run_on: 'Run-on sentences',
  spelling: 'Spelling',
  grammar: 'Grammar and word choice',
  punctuation: 'Punctuation',
};

const LANGUAGE_TOOL: Record<string, PatternKey | null> = { TYPOS: 'spelling', GRAMMAR: 'grammar', CONFUSED_WORDS: 'grammar', PUNCTUATION: 'punctuation', REDUNDANCY: null };
const TEXT_RULES: [RegExp, PatternKey][] = [
  [/comma splice/, 'comma_splice'],
  [/run-on|run on|fused sentence/, 'run_on'],
  [/topic sentence/, 'weak_topic_sentence'],
  [/over-?quot|too many quot|long quot/, 'over_quoting'],
  [/citation|\bcite|source format/, 'citation'],
  [/transition/, 'weak_transitions'],
];
const RUBRIC: Record<string, PatternKey> = { Thesis: 'vague_thesis', Evidence: 'unsupported_claim', Analysis: 'missing_analysis' };

/**
 * Feedback categories are the model's free text, so patterns come from fixed rules, first match wins. An item the rules
 * don't recognize counts toward no pattern rather than an "Other" bucket nobody can act on.
 */
export function patternOf(item: { layer: string; category: string; summary: string; rubric_criterion: string | null; source: string }): PatternKey | null {
  if (item.source === 'languagetool') return LANGUAGE_TOOL[item.category] ?? null;
  const text = `${item.category} ${item.summary}`.toLowerCase();
  for (const [re, key] of TEXT_RULES) if (re.test(text)) return key;
  return (item.rubric_criterion && RUBRIC[item.rubric_criterion]) || null;
}
