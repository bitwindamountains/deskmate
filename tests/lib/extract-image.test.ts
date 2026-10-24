import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const recognize = vi.fn();
const terminate = vi.fn();
vi.mock('tesseract.js', () => ({ createWorker: async () => ({ recognize, terminate }) }));

import { extractEssayFile, isImage } from '@/lib/essay/extract';

afterEach(() => { recognize.mockReset(); terminate.mockReset(); });
beforeEach(() => { terminate.mockResolvedValue(undefined); });
const photo = (name = 'notes.jpg') => new File(['x'], name, { type: 'image/jpeg' });

test('a photo is read on the device and its text returned for the student to correct (A3.12, B2.1)', async () => {
  recognize.mockResolvedValue({ data: { text: '  Glycolysis happens in the\ncytoplasm.  \n' } });
  expect(await extractEssayFile(photo())).toEqual({ ok: true, text: 'Glycolysis happens in the\ncytoplasm.' });
  expect(terminate).toHaveBeenCalled();
});

test('a photo with no readable text, or a failed read, says so plainly', async () => {
  recognize.mockResolvedValue({ data: { text: '   ' } });
  expect(await extractEssayFile(photo())).toEqual({ ok: false, error: "We couldn't find any text in that photo. Try a sharper, well-lit photo, or type the text." });
  recognize.mockRejectedValue(new Error('boom'));
  expect(await extractEssayFile(photo('page.png'))).toEqual({ ok: false, error: "We couldn't read that file. Try another file or paste the text instead." });
  expect(terminate).toHaveBeenCalledTimes(2);
});

test('isImage knows the photo types', () => {
  expect(['a.JPG', 'b.jpeg', 'c.png', 'd.webp'].every(isImage)).toBe(true);
  expect(isImage('e.pdf')).toBe(false);
});
