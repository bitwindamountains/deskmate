import { expect, test } from 'vitest';
import { PATTERNS, patternOf } from '@/growth/patterns';

const llm = (category: string, summary = '', rubric_criterion: string | null = null) =>
  ({ layer: 'paragraph', category, summary, rubric_criterion, source: 'llm' });

test('patternOf maps LanguageTool categories, text rules before rubric fallbacks, and unknown categories to null', () => {
  const lt = (category: string) => ({ layer: 'sentence', category, summary: 'x', rubric_criterion: 'Conventions', source: 'languagetool' });
  expect(patternOf(lt('TYPOS'))).toBe('spelling');
  expect(patternOf(lt('GRAMMAR'))).toBe('grammar');
  expect(patternOf(lt('CONFUSED_WORDS'))).toBe('grammar');
  expect(patternOf(lt('PUNCTUATION'))).toBe('punctuation');
  expect(patternOf(lt('REDUNDANCY'))).toBeNull();
  expect(patternOf(llm('Evidence', 'This is a comma splice', 'Evidence'))).toBe('comma_splice');
  expect(patternOf(llm('Sentence structure', 'A run-on sentence joins two ideas'))).toBe('run_on');
  expect(patternOf(llm('Topic Sentence', 'The paragraph lacks a clear topic sentence', 'Organization'))).toBe('weak_topic_sentence');
  expect(patternOf(llm('Quotations', 'Long quotes take over your voice'))).toBe('over_quoting');
  expect(patternOf(llm('Citation', 'Cite the source', 'Conventions'))).toBe('citation');
  expect(patternOf(llm('Flow', 'Add a transition between ideas'))).toBe('weak_transitions');
  expect(patternOf(llm('Thesis clarity', 'Thesis is vague', 'Thesis'))).toBe('vague_thesis');
  expect(patternOf(llm('Depth', 'Needs more support', 'Evidence'))).toBe('unsupported_claim');
  expect(patternOf(llm('Depth', 'Explain the link', 'Analysis'))).toBe('missing_analysis');
  expect(patternOf(llm('Overall flow', 'Nice tone', null))).toBeNull();
  expect(patternOf(llm('Overall flow', 'Nice tone', 'Organization'))).toBeNull();
  expect(Object.keys(PATTERNS)).toHaveLength(12);
});

test('cite and run only count when they name the pattern', () => {
  expect(patternOf(llm('Evidence', 'The statistic you cite is from 1998', 'Evidence'))).toBe('unsupported_claim');
  expect(patternOf(llm('Evidence', 'Studies cited here are dated', 'Evidence'))).toBe('unsupported_claim');
  expect(patternOf(llm('Citation', 'Use APA citation format', 'Conventions'))).toBe('citation');
  expect(patternOf(llm('Sources', 'Cite the source of this figure', 'Evidence'))).toBe('citation');
  expect(patternOf(llm('Analysis', 'If you run once more through the logic, explain it', 'Analysis'))).toBe('missing_analysis');
  expect(patternOf(llm('Structure', 'This run-on sentence needs a break'))).toBe('run_on');
  expect(PATTERNS.vague_thesis).toBe('Thesis');
});
