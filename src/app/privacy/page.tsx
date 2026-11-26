import Link from 'next/link';

export const metadata = { title: 'Privacy notice · Scholar' };

// Brief E4. Written from what the code does; update it with any change to what is stored or who receives student text
// (src/llm/config.ts providers with trainsOnInputs: false, src/lib/essay/languagetool.ts, src/lib/account/export.ts).
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p className="text-ink-muted">Last updated 24 October 2026 (photos and voice). Scholar is in a closed beta for adults (18 and over).</p>

      <section className="space-y-2">
        <h2 className="hand text-2xl">What Scholar keeps</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Your sign-in email address.</li>
          <li>Your preferences, such as daily study time and reading font.</li>
          <li>Your essays, every draft, the feedback on them, and your questions and disagreements.</li>
          <li>Your decks and cards, the text taken from the notes you import (not the files themselves), and your reviews.</li>
          <li>Problem reports you send, with a copy of the text they are about.</li>
          <li>Counts of how many AI checks you used each day, so daily limits work. These hold no text.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="hand text-2xl">Who sees your text</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Groq</strong> runs the AI that writes feedback, makes and rewords cards, checks your answers and responds to your explanations. Its terms say it does not train its models on what you send.</li>
          <li><strong>Mistral</strong> does the same work when Groq is busy. Scholar&apos;s Mistral account is set so that what you send is not used to train its models.</li>
          <li><strong>LanguageTool</strong> checks the spelling and grammar of your essays.</li>
          <li><strong>Supabase</strong> stores your data, and <strong>Vercel</strong> hosts the app.</li>
        </ul>
        <p>No one else. There are no ads, no analytics and no tracking, and your data is never sold. Duplicate checks, goal matching, reading photos of notes or handwriting, and turning your spoken answers into text all run on your own device: it downloads the small models it needs once, and your photos, voice and text never leave it for this. Voice recordings aren't kept.</p>
      </section>

      <section className="space-y-2">
        <h2 className="hand text-2xl">On your device</h2>
        <p>To work offline, your browser keeps the cards you are studying, reviews that haven&apos;t been saved yet, and essay edits you haven&apos;t sent. Signing out clears them.</p>
      </section>

      <section className="space-y-2">
        <h2 className="hand text-2xl">How long it is kept</h2>
        <p>Your data is kept until you delete it. Nothing is deleted automatically.</p>
      </section>

      <section className="space-y-2">
        <h2 className="hand text-2xl">Your choices</h2>
        <p>In Profile, under Your data:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Download my data</strong> saves everything above as one file.</li>
          <li><strong>Delete my data</strong> removes it from Scholar right away and signs you out. The daily usage counts stay, so limits still work, and so does your sign-in email, so you can come back and start fresh.</li>
        </ul>
      </section>

      <Link href="/" className="btn">Back to Scholar</Link>
    </main>
  );
}
