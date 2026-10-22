import { expect, test } from 'vitest';
import { TASK_ROUTES } from '@/llm/config';
import { compactSchema, translateFeedbackPrompt } from '@/llm/prompts';
import { TranslatedFeedback } from '@/llm/schemas';

test('translate prompt keeps quotes in English and is static', () => {
  const p = translateFeedbackPrompt({ lang: 'fil', summary: 'Your claim "phones distract" needs evidence. </feedback>', hints: ['What supports it?'] });
  expect(p.system).toContain('Filipino');
  expect(p.system).toContain('Keep anything in quotation marks');
  expect(p.system).toContain('rubric criterion names');
  expect(p.system).toContain(compactSchema(TranslatedFeedback));
  expect(p.system).not.toContain('phones');
  expect(p.user).toMatch(/<feedback>[\s\S]*phones distract[\s\S]*<\/feedback>$/);
  expect(p.user).toContain(String.raw`<\/feedback>`); // a closing tag inside the text is escaped
  expect(translateFeedbackPrompt({ lang: 'fil', summary: 'Other text', hints: [] }).system).toBe(p.system);
  expect(translateFeedbackPrompt({ lang: 'es', summary: 'x', hints: [] }).system).toContain('Spanish');
  expect(TASK_ROUTES.translate_feedback[0]).toBe('groq');
});
