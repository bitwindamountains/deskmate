'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { extractEssayFile } from '@/lib/essay/extract';
import { validateEssay, type EssayType } from '@/lib/essay/text';
import { createEssay } from '../actions';

const TYPES: [EssayType, string][] = [
  ['argumentative', 'Argumentative'], ['expository', 'Expository'], ['narrative', 'Narrative'],
  ['compare-contrast', 'Compare and contrast'], ['research', 'Research'], ['personal-statement', 'Personal statement'],
];
const GRADES = [['high school', 'High school'], ['college', 'College'], ['graduate', 'Graduate']];
const CITATIONS = ['APA', 'MLA', 'Chicago', 'Harvard'];
const SAVE_FAILED = "We couldn't save your essay. Please try again.";

export function NewEssayForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setErrorMsg] = useState('');
  const [errField, setErrField] = useState('');
  const setError = (msg: string, field = '') => { setErrorMsg(msg); setErrField(msg ? field : ''); };
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reading, setReading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [essayType, setEssayType] = useState<EssayType>('argumentative');
  const [gradeLevel, setGradeLevel] = useState('college');
  const [citationStyle, setCitationStyle] = useState('');

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
        const r = await createEssay({
          title: title.trim(), essayType, gradeLevel, assignmentPrompt: prompt.trim() || null, citationStyle: citationStyle || null, content,
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

      <details className="rounded-xl border border-line bg-surface p-4">
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

      <button type="submit" disabled={pending || reading} className="btn btn-primary">Get feedback</button>
    </form>
  );
}
