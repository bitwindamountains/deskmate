'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { extractEssayFile, IMAGE_ACCEPT, isImage } from '@/lib/essay/extract';
import { looksLikeVerse, validateEssay, type EssayType } from '@/lib/essay/text';
import { parseRubric } from '@/lib/essay/rubric';
import { DEFAULT_RUBRIC } from '@/llm/prompts';
import { createEssay } from '../actions';
import { minutesUsed, TimeLeft, Timer } from './timer';

// A7: types whose rubric expects prose arguments, where a poem would get misplaced feedback.
const PROSE_TYPES: EssayType[] = ['argumentative', 'expository', 'compare-contrast', 'research'];

const TYPES: [EssayType, string][] = [
  ['argumentative', 'Argumentative'], ['expository', 'Expository'], ['narrative', 'Narrative'],
  ['compare-contrast', 'Compare and contrast'], ['research', 'Research'], ['personal-statement', 'Personal statement'],
];
const GRADES = [['high school', 'High school'], ['college', 'College'], ['graduate', 'Graduate']];
const CITATIONS = ['APA', 'MLA', 'Chicago', 'Harvard'];
const SAVE_FAILED = "We couldn't save your essay. Please try again.";

/** initialTitle and initialPrompt come from a card or deck (C1): the form opens as an expository writing task. */
export function NewEssayForm({ initialTitle = '', initialPrompt = '' }: { initialTitle?: string; initialPrompt?: string } = {}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setErrorMsg] = useState('');
  const [errField, setErrField] = useState('');
  const setError = (msg: string, field = '') => { setErrorMsg(msg); setErrField(msg ? field : ''); };
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState('');
  const [reading, setReading] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [essayType, setEssayType] = useState<EssayType>(initialPrompt ? 'expository' : 'argumentative');
  const [rubricText, setRubricText] = useState('');
  const rubricParse = parseRubric(rubricText);
  // A2.1: the self-rating follows the rubric the essay will be scored on.
  const criteria = rubricParse.ok && rubricParse.rubric ? rubricParse.rubric : DEFAULT_RUBRIC;
  const [verseAsked, setVerseAsked] = useState(false); // A7: asked once about this text and type; submitting again goes ahead
  const [ocrNote, setOcrNote] = useState(false); // B7: text read from a photo needs checking
  const [gradeLevel, setGradeLevel] = useState('college');
  const [citationStyle, setCitationStyle] = useState('');
  const [selfScores, setSelfScores] = useState<Record<string, string>>({});
  const [weakness, setWeakness] = useState('');
  const [timed, setTimed] = useState<'' | '20' | '30' | '45'>('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    setReading(true);
    const r = await extractEssayFile(file);
    setReading(false);
    if (r.ok) { setContent(r.text); setVerseAsked(false); setOcrNote(isImage(file.name)); }
    else setError(r.error, 'file');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Add a title for your essay.', 'title');
    const v = validateEssay(content);
    if (!v.ok) return setError(v.error, 'essay');
    if (!rubricParse.ok) return setError(rubricParse.error, 'rubric');
    if (!verseAsked && PROSE_TYPES.includes(essayType) && looksLikeVerse(content)) {
      setVerseAsked(true);
      return setError('This looks like a poem or song. Draft Coach is built for essays: for creative writing, choose Narrative or Personal statement as the essay type. To check it as it is, select Get feedback again.', 'essay');
    }
    setError('');
    start(async () => {
      try {
        // A3.7: optional; only the criteria the student rated are sent, and nothing at all when the section is untouched.
        const scores = criteria.flatMap((c) => (selfScores[c.name] ? [{ criterion: c.name, score: Number(selfScores[c.name]) }] : []));
        const self = scores.length || weakness.trim() ? { selfAssessment: { scores, weakness: weakness.trim() || null } } : {};
        // A4.5: only a started timer makes this a timed essay; minutes used are whole minutes, rounded up.
        const time = timed && startedAt !== null ? { timedMinutes: Number(timed) as 20 | 30 | 45, minutesUsed: minutesUsed(Number(timed), startedAt, stoppedAt) } : {};
        const r = await createEssay({
          title: title.trim(), essayType, gradeLevel, assignmentPrompt: prompt.trim() || null, citationStyle: citationStyle || null, content, ...self, ...time,
          ...(rubricText.trim() ? { rubric: rubricText } : {}),
        });
        if (r.ok) router.push(`/write/${r.essayId}`);
        else setError(r.error);
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  const bad = (id: string) => (error && errField === id ? { 'aria-invalid': true, 'aria-describedby': 'essay-err' } : {});
  return (
    <form onSubmit={submit} className="max-w-prose space-y-5">
      {error && <p id="essay-err" role="alert" className="error">{error}</p>}

      <div className="space-y-3">
        <div>
          <label htmlFor="timed" className="mb-1 block">Timed practice</label>
          <select id="timed" value={timed} disabled={startedAt !== null} className="field"
            onChange={(e) => setTimed(e.target.value as typeof timed)}>
            <option value="">Off</option>
            <option value="20">20 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
          </select>
        </div>
        {timed && startedAt === null && <button type="button" className="btn" onClick={() => setStartedAt(Date.now())}>Start the timer</button>}
        {timed && startedAt !== null && <Timer minutes={Number(timed)} startedAt={startedAt} stoppedAt={stoppedAt} onStop={() => setStoppedAt(Date.now())} onResume={() => setStoppedAt(null)} />}
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block">Title</label>
        <input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="field" {...bad('title')} />
      </div>

      <div>
        <label htmlFor="essay" className="mb-1 block">Your essay</label>
        <textarea id="essay" rows={14} value={content} onChange={(e) => { setContent(e.target.value); setVerseAsked(false); }} className="field" {...bad('essay')} />
      </div>

      <div>
        <label htmlFor="essay-file" className="mb-1 block">Or upload a .pdf, a .docx, or a photo of handwriting</label>
        <input id="essay-file" type="file" className="field" {...bad('file')}
          accept={`.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,${IMAGE_ACCEPT}`}
          onChange={(e) => pick(e.target.files?.[0])} />
        <p role="status" className="text-sm text-ink-muted empty:hidden">{ocrNote && 'Read from your photo on this device. Check the text in the box: handwriting often has a few mistakes.'}</p>
        {reading && <p className="mt-1" role="status">Reading your file…</p>}
      </div>

      <details className="inlay p-4" open={!!initialPrompt}>
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">Assignment details (optional)</summary>
        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="prompt" className="mb-1 block">Assignment prompt</label>
            <textarea id="prompt" rows={4} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="essay-type" className="mb-1 block">Essay type</label>
            <select id="essay-type" value={essayType} onChange={(e) => { setEssayType(e.target.value as EssayType); setVerseAsked(false); }} className="field">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="grade" className="mb-1 block">Grade level</label>
            <select id="grade" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} className="field">
              {GRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="citation" className="mb-1 block">Citation style</label>
            <select id="citation" value={citationStyle} onChange={(e) => setCitationStyle(e.target.value)} className="field">
              <option value="">None</option>
              {CITATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rubric" className="mb-1 block">Your rubric (optional)</label>
            <textarea id="rubric" rows={5} maxLength={4000} value={rubricText} onChange={(e) => setRubricText(e.target.value)} className="field"
              {...bad('rubric')} aria-describedby={error && errField === 'rubric' ? 'essay-err rubric-help' : 'rubric-help'} />
            <p id="rubric-help" className="mt-1 text-sm text-ink-muted">
              One criterion per line, like &quot;Evidence: uses specific sources&quot;. 2 to 8 lines, each scored 1 to 4. Leave it empty to use Scholar&apos;s rubric.
            </p>
          </div>
        </div>
      </details>

      <details className="inlay p-4">
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">Rate it yourself first (optional)</summary>
        <div className="mt-4 space-y-5">
          <p className="text-ink-muted">After feedback, you&apos;ll see how your rating compares with the coach&apos;s.</p>
          {/* ids by position: a student's criterion name can hold spaces, which would split aria-describedby */}
          {criteria.map((c, i) => (
            <div key={c.name}>
              <label htmlFor={`self-${i}`} className="mb-1 block">{c.name}</label>
              <select id={`self-${i}`} value={selfScores[c.name] ?? ''} className="field" aria-describedby={`self-${i}-d`}
                onChange={(e) => setSelfScores((s) => ({ ...s, [c.name]: e.target.value }))}>
                <option value="">Not rated</option>
                {Array.from({ length: c.maxScore }, (_, k) => <option key={k} value={k + 1}>{`${k + 1} of ${c.maxScore}`}</option>)}
              </select>
              <p id={`self-${i}-d`} className="mt-1 text-sm text-ink-muted">{c.description}</p>
            </div>
          ))}
          <div>
            <label htmlFor="weakness" className="mb-1 block">What&apos;s your essay&apos;s biggest weakness?</label>
            <textarea id="weakness" rows={2} maxLength={300} value={weakness} onChange={(e) => setWeakness(e.target.value)} className="field" />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || reading} className="btn btn-primary">Get feedback</button>
        {timed && startedAt !== null && stoppedAt === null && <TimeLeft minutes={Number(timed)} startedAt={startedAt} />}
      </div>
    </form>
  );
}
