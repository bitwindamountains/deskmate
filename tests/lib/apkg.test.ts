import { zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { zstdCompressSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { ankiText, clozeCards, readApkg } from '@/lib/cards/apkg';

type Note = [string, string, string?]; // front, back, tags

/** A minimal .apkg: each collection file holds a notes table, the only table the reader uses. */
async function apkg(collections: Record<string, Note[]>): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const files: Record<string, Uint8Array> = {};
  for (const [name, notes] of Object.entries(collections)) {
    const db = new SQL.Database();
    db.run('create table notes (id integer primary key, flds text, tags text)');
    notes.forEach(([front, back, tags = ''], i) => db.run('insert into notes values (?, ?, ?)', [i + 1, `${front}\x1f${back}`, tags]));
    const bytes = db.export();
    db.close();
    files[name] = name.endsWith('anki21b') ? new Uint8Array(zstdCompressSync(bytes)) : bytes;
  }
  files.media = new TextEncoder().encode('{}');
  return zipSync(files);
}

test('ankiText turns Anki HTML into plain text', () => {
  expect(ankiText('Cell<br>wall&nbsp;&amp; <b>membrane</b>[sound:a.mp3]')).toBe('Cell\nwall & membrane');
  expect(ankiText('<div>One</div><div>Two</div>')).toBe('One\nTwo');
  expect(ankiText('&#233;t&#xE9;')).toBe('été');
  expect(ankiText('<img src="x.png">')).toBe('');
});

test('clozeCards makes one card per cloze number', () => {
  expect(clozeCards('{{c1::Paris}} is in {{c2::France::country}}')).toEqual([
    { front: '{{c1::Paris}} is in France', back: 'Paris' },
    { front: 'Paris is in {{c1::France}}', back: 'France' },
  ]);
  expect(clozeCards('no cloze here')).toEqual([]);
});

test('readApkg reads basic and cloze notes, uses the first tag as concept, skips empty sides', async () => {
  const bytes = await apkg({ 'collection.anki2': [
    ['Q1', 'A1', ' Biology::Cells '],
    ['{{c1::Mitochondria}} make ATP', 'extra'],
    ['<img src="x.png">', 'A3'],
  ] });
  const r = await readApkg(bytes);
  expect(r.cards).toEqual([
    { front: 'Q1', back: 'A1', concept: 'Biology / Cells', type: 'basic' },
    { front: '{{c1::Mitochondria}} make ATP', back: 'Mitochondria', concept: '', type: 'cloze' },
  ]);
  expect(r.skipped).toBe(1);
});

test('readApkg prefers anki21b over the dummy anki2 newer Anki writes', async () => {
  const bytes = await apkg({ 'collection.anki2': [['Please update to the latest Anki version', '']],
    'collection.anki21b': [['Real Q', 'Real A']] });
  expect((await readApkg(bytes)).cards.map((c) => c.front)).toEqual(['Real Q']);
});

test('readApkg reports files that are not Anki packages and caps the card count', async () => {
  expect((await readApkg(new Uint8Array([1, 2, 3]))).error).toBe("That file isn't an Anki package (.apkg).");
  expect((await readApkg(zipSync({ 'x.txt': new Uint8Array(1) }))).error).toBe("That file isn't an Anki package (.apkg).");
  const many = await apkg({ 'collection.anki2': Array.from({ length: 2001 }, (_, i): Note => [`q${i}`, `a${i}`]) });
  expect((await readApkg(many)).error).toBe('Import at most 2,000 cards at a time. In Anki, export a smaller subdeck and import that.');
});

test('Image Occlusion notes are skipped, not turned into cloze cards', async () => {
  const bytes = await apkg({ 'collection.anki2': [['{{c1::image-occlusion:rect:left=.2:top=.3:width=.1:height=.1}}', '<img src="x.png">'], ['Q', 'A']] });
  const r = await readApkg(bytes);
  expect(r.cards.map((c) => c.front)).toEqual(['Q']);
  expect(r.skipped).toBe(1);
});

test('ankiText drops numeric entities that are not real characters instead of failing the import', () => {
  expect(ankiText('a&#0;b&#99999999;c&#xD800;d')).toBe('abcd');
});
