export type CsvCard = { front: string; back: string; concept: string; type: 'basic' | 'cloze' | 'why' };

const MAX_ROWS = 2000;
const MAX_FIELD = 500; // the deck editor's limit for front and back
const TYPES = new Set(['basic', 'cloze', 'why']);

type Row = { fields: string[]; n: number }; // n: the row number a spreadsheet shows, blank rows included

/** RFC 4180 rows: quoted fields, "" escapes, separators and newlines inside quotes, CRLF or LF. null when a quoted field never closes. */
function rows(text: string, sep: string): Row[] | null {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true; // only a field's first character opens quotes: 32" screen stays text
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); out.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) return null; // an open quote would otherwise swallow the rest of the file into one card
  if (field || row.length) { row.push(field); out.push(row); }
  return out.map((fields, i) => ({ fields, n: i + 1 })).filter((r) => r.fields.some((f) => f.trim()));
}

/** Excel in many European locales saves "CSV" with semicolons; the header row (first non-blank line) says which one this file uses. */
function separator(text: string): string {
  const head = (text.split(/\r?\n/).find((l) => l.trim()) ?? '').replace(/"[^"]*"/g, ''); // quoted text can hold either character
  return (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
}

// Undo the export's formula guard: one apostrophe before = + - @ came from toCsv, not from the student.
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

/** Cards from a CSV with a header row naming front and back (concept and type optional). skippedRows are spreadsheet row numbers. */
export function parseCards(text: string): { cards: CsvCard[]; skippedRows: number[]; error?: string } {
  const clean = text.replace(/^﻿/, '');
  const all = rows(clean, separator(clean));
  if (!all) return { cards: [], skippedRows: [], error: "A quote mark in the file isn't closed." };
  if (!all.length) return { cards: [], skippedRows: [], error: 'The file is empty.' };
  const head = all[0].fields.map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (col('front') < 0 || col('back') < 0) return { cards: [], skippedRows: [], error: 'The first row needs "front" and "back" columns.' };
  const body = all.slice(1);
  if (body.length > MAX_ROWS) return { cards: [], skippedRows: [], error: 'Import at most 2,000 cards at a time.' };
  const cards: CsvCard[] = [];
  const skippedRows: number[] = [];
  for (const { fields: r, n } of body) {
    const get = (name: string) => (col(name) >= 0 ? unguard((r[col(name)] ?? '').trim()) : '');
    const front = get('front'), back = get('back'), type = get('type').toLowerCase();
    if (!front || !back || front.length > MAX_FIELD || back.length > MAX_FIELD) { skippedRows.push(n); continue; }
    cards.push({ front, back, concept: get('concept').slice(0, 120), type: (TYPES.has(type) ? type : 'basic') as CsvCard['type'] });
  }
  return { cards, skippedRows };
}

// A cell starting with one of these runs as a formula in spreadsheet apps (CSV injection), so it gets a leading apostrophe.
const cell = (s: string) => {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(cards: { front: string; back: string; concept: string; type: string }[]): string {
  return ['front,back,concept,type', ...cards.map((c) => [c.front, c.back, c.concept, c.type].map(cell).join(','))].join('\r\n') + '\r\n';
}

/** Anki's plain-text import: one note per line, tab between front and back. */
export function toAnkiText(cards: { front: string; back: string }[]): string {
  const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  return ['#separator:tab', '#html:false', ...cards.map((c) => `${flat(c.front)}\t${flat(c.back)}`)].join('\n') + '\n';
}
