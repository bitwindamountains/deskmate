'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { extractEssayFile } from '@/lib/essay/extract';
import { validateEssay, type EssayType } from '@/lib/essay/text';
import { DEFAULT_RUBRIC } from '@/llm/prompts';
import { createEssay } from '../actions';
import { Timer } from './timer';

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
  const [gradeLevel, setGradeLevel] = useState('college');
  const [citationStyle, setCitationStyle] = useState('');
  const [selfScores, setSelfScores] = useState<Record<string, string>>({});
  const [weakness, setWeakness] = useState('');
  const [timed, setTimed] = useState<'' | '20' | '30' | '45'>('');
  const [startedAt, setStartedAt] = useState<number | null>(null);

  async function pick(file?: File) {
    setError('');
    if (!file) return;
    setReading(true);
    const r = await extractEssayFile(file);
    setReading(false);
    if (r.ok) setContent(r.text);
    else setError(r.error, 'file');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Add a title for your essay.', 'title');
    const v = validateEssay(content);
    if (!v.ok) return setError(v.error, 'essay');
    setError('');
    start(async () => {
      try {
        // A3.7: optional; only the criteria the student rated are sent, and nothing at all when the section is untouched.
        const scores = DEFAULT_RUBRIC.flatMap((c) => (selfScores[c.name] ? [{ criterion: c.name, score: Number(selfScores[c.name]) }] : []));
        const self = scores.length || weakness.trim() ? { selfAssessment: { scores, weakness: weakness.trim() || null } } : {};
        // A4.5: only a started timer makes this a timed essay; minutes used are whole minutes, rounded up.
        const time = timed && startedAt !== null ? { timedMinutes: Number(timed) as 20 | 30 | 45, minutesUsed: Math.min(600, Math.ceil((Date.now() - startedAt) / 60_000)) } : {};
        const r = await createEssay({
          title: title.trim(), essayType, gradeLevel, assignmentPrompt: prompt.trim() || null, citationStyle: citationStyle || null, content, ...self, ...time,
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
        {timed && startedAt !== null && <Timer minutes={Number(timed)} startedAt={startedAt} />}
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block">Title</label>
        <input id="title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="field" {...bad('title')} />
      </div>

      <div>
        <label htmlFor="essay" className="mb-1 block">Your essay</label>
        <textarea id="essay" rows={14} value={content} onChange={(e) => setContent(e.target.value)} className="field" {...bad('essay')} />
      </div>

      <div>
        <label htmlFor="essay-file" className="mb-1 block">Or upload a .pdf or .docx file</label>
        <input id="essay-file" type="file" className="field" {...bad('file')}
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pick(e.target.files?.[0])} />
        {reading && <p className="mt-1" role="status">Reading your file…</p>}
      </div>

      <details className="rounded-xl border border-line bg-surface p-4" open={!!initialPrompt}>
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">Assignment details (optional)</summary>
        <div className="mt-4 space-y-5">
          <div>
            <label htmlFor="prompt" className="mb-1 block">Assignment prompt</label>
            <textarea id="prompt" rows={4} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="essay-type" className="mb-1 block">Essay type</label>
            <select id="essay-type" value={essayType} onChange={(e) => setEssayType(e.target.value as EssayType)} className="field">
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
        </div>
      </details>

      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">Rate it yourself first (optional)</summary>
        <div className="mt-4 space-y-5">
          <p className="text-ink-muted">After feedback, you&apos;ll see how your rating compares with the coach&apos;s.</p>
          {DEFAULT_RUBRIC.map((c) => (
            <div key={c.name}>
              <label htmlFor={`self-${c.name}`} className="mb-1 block">{c.name}</label>
              <select id={`self-${c.name}`} value={selfScores[c.name] ?? ''} className="field" aria-describedby={`self-${c.name}-d`}
                onChange={(e) => setSelfScores((s) => ({ ...s, [c.name]: e.target.value }))}>
                <option value="">Not rated</option>
                {Array.from({ length: c.maxScore }, (_, k) => <option key={k} value={k + 1}>{`${k + 1} of ${c.maxScore}`}</option>)}
              </select>
              <p id={`self-${c.name}-d`} className="mt-1 text-sm text-ink-muted">{c.description}</p>
            </div>
          ))}
          <div>
            <label htmlFor="weakness" className="mb-1 block">What&apos;s your essay&apos;s biggest weakness?</label>
            <textarea id="weakness" rows={2} maxLength={300} value={weakness} onChange={(e) => setWeakness(e.target.value)} className="field" />
          </div>
        </div>
      </details>

      <button type="submit" disabled={pending || reading} className="btn btn-primary">Get feedback</button>
    </form>
  );
}
