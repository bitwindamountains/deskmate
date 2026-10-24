export type ExtractResult = { ok: true; text: string } | { ok: false; error: string };

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
export const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

/**
 * Browser only: reads the text of a .pdf (text layer), a .docx, or a photo. The readers are imported lazily, like pdf.ts.
 * Photos (A3.12 handwriting, B2.1 notes) are read by Tesseract.js on the device: the image never leaves it. It downloads
 * its English model once. The text goes in the box for the student to correct (B7).
 */
export async function extractEssayFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  if (isImage(name)) {
    let worker: { recognize: (f: File) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | undefined;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      const text = (await worker.recognize(file)).data.text.trim();
      return text ? { ok: true, text } : { ok: false, error: "We couldn't find any text in that photo. Try a sharper, well-lit photo, or type the text." };
    } catch {
      return { ok: false, error: "We couldn't read that file. Try another file or paste the text instead." };
    } finally {
      await Promise.resolve(worker?.terminate()).catch(() => undefined); // frees the worker; a failure here mustn't hide the result
    }
  }
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
  return { ok: false, error: 'We can only read .pdf, .docx and photo (.png, .jpg, .webp) files.' };
}
