export type ExtractResult = { ok: true; text: string } | { ok: false; error: string };

/** Browser only: reads the text of a .pdf (text layer) or .docx. The readers are imported lazily, like pdf.ts. */
export async function extractEssayFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.pdf')) {
      const { extractPdfPages, hasTextLayer } = await import('@/lib/import/pdf');
      const pages = await extractPdfPages(file);
      if (!hasTextLayer(pages)) return { ok: false, error: 'This PDF has no selectable text. Paste the text instead.' };
      // ponytail: pages become paragraphs; PDF line breaks inside a page aren't rejoined. The student can fix it in the box.
      return { ok: true, text: pages.map((p) => p.text).filter(Boolean).join('\n\n') };
    }
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { ok: true, text: value.trim() };
    }
  } catch {
    return { ok: false, error: "We couldn't read that file. Try another file or paste the text instead." };
  }
  return { ok: false, error: 'We can only read .pdf and .docx files.' };
}
