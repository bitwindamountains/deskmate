// Browser-only in the app (next.config aliases sql.js away from server bundles); tests run it in node.
import { unzipSync } from 'fflate';
import { decompress } from 'fzstd';
import type { CsvCard } from './csv';

const MAX_CARDS = 2000;
const MAX_FIELD = 500; // same limits as CSV import
const NOT_APKG = "That file isn't an Anki package (.apkg).";
// Newer Anki writes anki21b (zstd) and a dummy anki2 whose one note says "please update", so the newest file wins.
const COLLECTIONS = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** Plain text from an Anki field: line breaks kept, tags, sounds and images dropped, entities decoded. */
export function ankiText(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>|<\/(?:div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
      if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#') && e !== '#39') return String.fromCodePoint(Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g;

/** One Scholar cloze card per Anki cloze number: that number stays hidden (as c1), the others show their answer. */
export function clozeCards(text: string): { front: string; back: string }[] {
  const numbers = [...new Set([...text.matchAll(CLOZE)].map((m) => m[1]))];
  return numbers.map((n) => {
    const answers: string[] = [];
    const front = text.replace(CLOZE, (_, k: string, answer: string) => {
      if (k !== n) return answer;
      answers.push(answer);
      return `{{c1::${answer}}}`;
    });
    return { front, back: answers.join('; ') };
  });
}

const conceptOf = (tags: string) => (tags.trim().split(/\s+/)[0] ?? '').replace(/::/g, ' / ').replace(/_/g, ' ').slice(0, 120);

/** Cards from an .apkg file. skipped counts notes that had an empty or over-long side. */
export async function readApkg(bytes: Uint8Array, wasmUrl?: string): Promise<{ cards: CsvCard[]; skipped: number; error?: string }> {
  let notes: [string, string][];
  try {
    const files = unzipSync(bytes, { filter: (f) => COLLECTIONS.includes(f.name) });
    const name = COLLECTIONS.find((n) => files[n]);
    if (!name) return { cards: [], skipped: 0, error: NOT_APKG };
    const data = name.endsWith('anki21b') ? decompress(files[name]) : files[name];
    const sqlJs = await import('sql.js'); // lazy, like pdf.js: the server build swaps it for an empty stub
    const SQL = await sqlJs.default(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
    const db = new SQL.Database(data);
    try {
      notes = (db.exec('select flds, tags from notes order by id')[0]?.values ?? []) as [string, string][];
    } finally {
      db.close();
    }
  } catch {
    return { cards: [], skipped: 0, error: NOT_APKG };
  }

  const cards: CsvCard[] = [];
  let skipped = 0;
  const fits = (s: string) => s.length > 0 && s.length <= MAX_FIELD;
  for (const [flds, tags] of notes) {
    const [first = '', second = ''] = flds.split('\x1f').map(ankiText);
    const concept = conceptOf(tags ?? '');
    const made = /\{\{c\d+::/.test(first)
      ? clozeCards(first).map((c) => ({ ...c, concept, type: 'cloze' as const }))
      : [{ front: first, back: second, concept, type: 'basic' as const }];
    if (!made.length || made.some((c) => !fits(c.front) || !fits(c.back))) { skipped++; continue; }
    cards.push(...made);
    if (cards.length > MAX_CARDS) return { cards: [], skipped: 0, error: 'Import at most 2,000 cards at a time.' };
  }
  return { cards, skipped };
}
