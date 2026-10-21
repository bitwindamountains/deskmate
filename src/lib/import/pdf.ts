import type { PageText } from '../../chunk';
export { hasTextLayer } from '../../chunk';

/** Browser only: extracts text per page with pdf.js (imported lazily so SSR never evaluates it). */
export async function extractPdfPages(file: File): Promise<PageText[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  }
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await loadingTask.promise;
  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = '';
    for (const it of content.items) {
      if (!('str' in it)) continue;
      text += it.str + (it.hasEOL ? '\n' : ' ');
    }
    pages.push({ page: n, text: text.trim() });
  }
  await loadingTask.destroy();
  return pages;
}

