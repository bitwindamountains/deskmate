// Browser only. B3.6 spoken answers: Whisper tiny (English) runs on the device through transformers.js, like the
// embedding model; the audio never leaves it. The model downloads once, then the browser caches it.
type Asr = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;
let asr: Promise<Asr> | null = null;

/** Recorded audio (any format the browser recorded) to text. Throws when the model or the audio can't be loaded. */
export async function transcribeOnDevice(blob: Blob): Promise<string> {
  // Whisper expects 16 kHz mono samples.
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const samples = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
    asr ??= import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'q8' }) as unknown as Asr);
    const out = await (await asr)(samples);
    return (Array.isArray(out) ? out[0]?.text ?? '' : out.text).trim();
  } catch (e) {
    asr = null; // let a later try load the model again
    throw e;
  } finally {
    void ctx.close();
  }
}
