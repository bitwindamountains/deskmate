import { expect, test } from 'vitest';
import { PATTERNS } from '@/growth/patterns';
import { TEMPLATES } from '@/growth/templates';

test('the APA card teaches the page number for direct quotes and no example quotes a real author', () => {
  const apa = TEMPLATES.citation!.find((c) => c.front.includes('APA'))!;
  expect(apa.back).toMatch(/page number/);
  expect(JSON.stringify(TEMPLATES)).not.toMatch(/Walker|Smith|Lee/);
});

test('every template pattern has 3–5 cards; fronts are unique; no pattern outside PATTERNS', () => {
  const keys = Object.keys(TEMPLATES);
  expect(keys.sort()).toEqual(Object.keys(PATTERNS).filter((k) => !['spelling', 'grammar', 'punctuation'].includes(k)).sort());
  const fronts = Object.values(TEMPLATES).flat().map((c) => c!.front);
  expect(new Set(fronts).size).toBe(fronts.length);
  for (const cards of Object.values(TEMPLATES)) {
    expect(cards!.length).toBeGreaterThanOrEqual(3);
    expect(cards!.length).toBeLessThanOrEqual(5);
    for (const c of cards!) {
      expect(c.front.length).toBeLessThanOrEqual(500);
      expect(c.example.trim()).not.toBe('');
    }
  }
});
