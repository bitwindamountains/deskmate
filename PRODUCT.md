# Product

<!-- impeccable:product-schema 1 -->

> Written from `ai-learning-platform-brief.md` without an interview (the owner chose to skip questions). Facts not stated in the brief are marked **(inferred)**.

## Platform

web

## Stack
Delegated, with a constraint from the owner: free, open-source, or free-tier services only for now. Chosen: Next.js + Tailwind as a PWA, Supabase free plan, client-side parsing/OCR/embeddings, a free-tier LLM router. Rationale in `docs/superpowers/specs/2026-10-20-scholar-design.md` §4.

## Users
- High school students (14–18) writing class essays and studying on phones.
- College students writing research papers and memorizing large volumes of reading.
- Board/licensure exam reviewees with a huge syllabus and a fixed exam date.
- Multilingual/ESL learners who understand the material but struggle to express it in English.
- Later: teachers with large classes (Phase 3); self-learners.
- Beta focus: adults, college students (P2) and exam reviewees (P4) **(inferred, pending owner approval)**.

## Product Purpose
Help students write better and remember more by coaching the process instead of doing the work. Two tools on one learner profile: Draft Coach (layered, prioritized, rubric-aligned essay feedback with a hint ladder) and Recall (grounded flashcards, typed answers graded for meaning, FSRS scheduling with exam-date mode). Success: essays revised after feedback improve their rubric score; learners complete due reviews and keep high true retention.

## Positioning
Optimizes for learning, not output. The AI asks, hints, and explains before it ever suggests a rewrite, and rewrites are capped. Every card links to a real source passage. Scheduling is honest about what can be covered before an exam.

## Operating Context
Mostly phones on unreliable connections. Short daily review sessions triggered by one notification. Essay revision loops across drafts. Study materials arrive as PDFs, pasted text, photos of notes, DOCX, and PPTX.

## Capabilities and Constraints
- MVP features: brief A2.1–A2.9 and B2.1–B2.8, plus Today screen and onboarding.
- No full-essay generation; level-5 rewrites capped per draft.
- Cards and citations must be grounded; never invent sources.
- Uploaded content is data, never instructions.
- Free-tier LLM quotas make AI calls scarce.
- Open decisions: B2C vs B2B, launch order of the two tools, final product names.

## Brand Commitments
Working names only: Scholar (platform), Draft Coach (essays), Recall (flashcards). All are placeholders.
Voice: specific, encouraging, honest about weaknesses, never about the student as a person; no guilt-based messaging (brief A5.3, B5.4).

## Evidence on Hand
Only the product brief. No users, testimonials, metrics, sample essays, pricing, or logos exist yet. Do not fabricate any.

## Product Principles
1. Coach, don't ghostwrite.
2. Less is more: show the few things that matter most first.
3. Show your work: every AI output traces to a rubric criterion, rule, or source passage.
4. Encourage, then challenge.
5. Humans stay in control: students can dispute feedback and override grades.

## Accessibility & Inclusion
Accessible by default: readable fonts with a dyslexia-friendly option, text-to-speech, high contrast, meaning never conveyed by color alone. Light and dark mode. Respect varieties of English; explain academic conventions as conventions, not errors. English only for now: feedback and the interface are in English.
