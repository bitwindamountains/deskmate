import { expect, test } from 'vitest';
import { parseCards, toAnkiText, toCsv } from '@/lib/cards/csv';

test('parseCards handles BOM, CRLF, quoted commas, quotes and newlines; skips rows without front or back and counts them', () => {
  const text = '﻿Front,Back,Concept,Type\r\n'
    + '"Where, exactly?","In the ""cytoplasm""",Cells,basic\r\n'
    + '"Two\nlines",Answer,,why\r\n'
    + ',missing front,,\r\n'
    + 'Q,A,,nonsense\r\n';
  const r = parseCards(text);
  expect(r.cards).toEqual([
    { front: 'Where, exactly?', back: 'In the "cytoplasm"', concept: 'Cells', type: 'basic' },
    { front: 'Two\nlines', back: 'Answer', concept: '', type: 'why' },
    { front: 'Q', back: 'A', concept: '', type: 'basic' },
  ]);
  expect(r.skippedRows).toEqual([4]);
});

test('parseCards needs front and back columns, and caps rows and field length', () => {
  expect(parseCards('question,answer\nQ,A').error).toBe('The first row needs "front" and "back" columns.');
  expect(parseCards('').error).toBe('The file is empty.');
  const many = 'front,back\n' + Array.from({ length: 2001 }, (_, i) => `q${i},a${i}`).join('\n');
  expect(parseCards(many).error).toBe('Import at most 2,000 cards at a time.');
  const r = parseCards(`front,back\n${'x'.repeat(501)},a\nok,fine`);
  expect(r.cards).toHaveLength(1);
  expect(r.skippedRows).toEqual([2]);
});

test('toCsv quotes fields and prefixes formula characters with an apostrophe', () => {
  const csv = toCsv([{ front: '=SUM(A1)', back: 'Has, a comma and "quotes"', concept: '@x', type: 'basic' }]);
  expect(csv).toBe('front,back,concept,type\r\n"\'=SUM(A1)","Has, a comma and ""quotes""","\'@x",basic\r\n');
  // round trip (the apostrophe is kept: it is now part of the text, as spreadsheets show it)
  expect(parseCards(toCsv([{ front: 'Q', back: 'A\nB', concept: 'c', type: 'why' }])).cards).toEqual([{ front: 'Q', back: 'A\nB', concept: 'c', type: 'why' }]);
});

test('toAnkiText writes the header and flattens tabs and newlines', () => {
  expect(toAnkiText([{ front: 'Q\tone', back: 'A\nline' }])).toBe('#separator:tab\n#html:false\nQ one\tA line\n');
});

test('a quote mark inside an unquoted field is plain text; an unclosed quoted field is an error', () => {
  expect(parseCards('front,back\nTV size,32" screen\nQ2,A2\n').cards).toEqual([
    { front: 'TV size', back: '32" screen', concept: '', type: 'basic' },
    { front: 'Q2', back: 'A2', concept: '', type: 'basic' },
  ]);
  expect(parseCards('front,back\n"Unclosed,A\nQ2,A2\n').error).toBe("A quote mark in the file isn't closed.");
});

test('a semicolon CSV imports like a comma one', () => {
  expect(parseCards('front;back;concept\nWhere, exactly?;Here;Place\n').cards).toEqual([{ front: 'Where, exactly?', back: 'Here', concept: 'Place', type: 'basic' }]);
});

test('the separator is read from the first non-blank line, ignoring quoted text', () => {
  expect(parseCards('\n\nfront;back\nQ;A\n').cards).toEqual([{ front: 'Q', back: 'A', concept: '', type: 'basic' }]);
  expect(parseCards('front,"notes; with; semicolons",back\nQ,n,A\n').cards).toEqual([{ front: 'Q', back: 'A', concept: '', type: 'basic' }]);
});

test('one apostrophe before a formula character is removed on import, undoing the export guard', () => {
  const cards = [{ front: '=1+1', back: '-5 degrees', concept: '@home', type: 'basic' }];
  expect(parseCards(toCsv(cards)).cards).toEqual(cards);
  expect(parseCards("front,back\n'plain,ok").cards[0].front).toBe("'plain");
});
