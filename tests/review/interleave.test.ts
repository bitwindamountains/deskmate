import { expect, test } from 'vitest';
import { conceptSummary, interleave } from '@/review/interleave';

const q = (spec: string) => spec.split(' ').map((s, i) => ({ id: `${s}${i}`, concept: s.toUpperCase() === s ? ` ${s} ` : s }));

test('interleave never puts two cards of one concept side by side while another concept has cards left', () => {
  const out = interleave(q('a a a b b c'));
  const keys = out.map((c) => c.concept.trim().toLowerCase());
  for (let i = 1; i < keys.length; i++) {
    const othersLeft = keys.slice(i).some((k) => k !== keys[i - 1]);
    if (othersLeft) expect(keys[i]).not.toBe(keys[i - 1]);
  }
  expect(keys).toEqual(['a', 'b', 'c', 'a', 'b', 'a']);
});

test("interleave keeps each concept's own due order", () => {
  const out = interleave(q('a b a b a'));
  expect(out.filter((c) => c.concept === 'a').map((c) => c.id)).toEqual(['a0', 'a2', 'a4']);
});

test('interleave groups concept spellings by trimmed lower case', () => {
  expect(interleave([{ id: '1', concept: 'Glycolysis' }, { id: '2', concept: ' glycolysis ' }, { id: '3', concept: 'Krebs' }]).map((c) => c.id)).toEqual(['1', '3', '2']);
});

test('conceptSummary lists concepts that got stronger and that need another look, at most 3 each', () => {
  const done = [
    { concept: 'Glycolysis', rating: 3 }, { concept: 'glycolysis', rating: 4 }, { concept: 'Krebs', rating: 3 }, { concept: 'Krebs', rating: 1 },
    { concept: 'ETC', rating: 2 }, { concept: 'a', rating: 1 }, { concept: 'b', rating: 1 }, { concept: 'c', rating: 1 }, { concept: 'd', rating: 3 },
  ];
  expect(conceptSummary(done)).toEqual({ improved: ['Glycolysis', 'd'], needsAttention: ['Krebs', 'a', 'b'] });
});
