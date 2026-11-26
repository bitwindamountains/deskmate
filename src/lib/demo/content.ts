import type { CardType } from '@/lib/cards/types';

/** What a demo account starts with. Written by hand (no AI call), shaped like real generated cards and essay feedback. */

export type DemoCard = { type: CardType; front: string; back: string; keyPoints: string[]; quote: string; concept: string;
  bloom: 'remember' | 'understand' | 'apply' | 'analyze'; importance: 1 | 2 | 3;
  /** Past reviews as [days ago, rating 1-4], oldest first. Empty: a new card. null: still waiting in triage. */
  history: [number, 1 | 2 | 3 | 4][] | null };
export type DemoDeck = { title: string; subject: string; examInDays: number | null; goals?: string; sourceTitle: string; notes: string[];
  cards: DemoCard[] };

const CELLS_1 = `Cells are the basic unit of life. Prokaryotic cells, such as bacteria, have no nucleus; their DNA floats in the cytoplasm. Eukaryotic cells keep their DNA inside a nucleus surrounded by a double membrane.

The mitochondria release energy from glucose through cellular respiration and store it as ATP. Cells that need a lot of energy, such as muscle cells, contain thousands of mitochondria. Chloroplasts, found in plant cells, capture light energy and use it to make glucose in photosynthesis.

The cell membrane is a phospholipid bilayer. It is selectively permeable: small non-polar molecules such as oxygen pass through freely, while ions and glucose need transport proteins.`;

const CELLS_2 = `Diffusion is the net movement of particles from an area of higher concentration to an area of lower concentration. It needs no energy from the cell. Osmosis is the diffusion of water across a selectively permeable membrane.

Active transport moves substances against their concentration gradient, from low to high concentration. It uses energy from ATP and carrier proteins, such as the sodium-potassium pump.

Enzymes are proteins that speed up chemical reactions without being used up. Each enzyme has an active site that fits one substrate. High temperatures change the shape of the active site, so the enzyme is denatured and stops working.`;

const HISTORY_1 = `The Industrial Revolution began in Britain in the late 1700s. Britain had large deposits of coal and iron, a growing population, and money from overseas trade to invest in new machines.

James Watt improved the steam engine in 1769 by adding a separate condenser, which made it far more efficient. Steam engines freed factories from needing to be built beside rivers.

Factory work changed daily life. Families moved from villages to crowded cities to find work, children often worked long shifts, and the Factory Act of 1833 limited the hours children could work in textile mills.`;

export const DEMO_DECKS: DemoDeck[] = [
  {
    title: 'Cell Biology', subject: 'Biology', examInDays: 18, goals: 'Unit 3 test: cell structure, transport across membranes, enzymes.',
    sourceTitle: 'Unit 3 notes: cells and energy', notes: [CELLS_1, CELLS_2],
    cards: [
      { type: 'basic', front: 'Which organelle releases energy from glucose and stores it as ATP?', back: 'The mitochondria', keyPoints: ['mitochondria'],
        quote: 'The mitochondria release energy from glucose through cellular respiration and store it as ATP.', concept: 'Organelles',
        bloom: 'remember', importance: 3, history: [[9, 3], [7, 3], [3, 3]] },
      { type: 'basic', front: 'What is the main difference between prokaryotic and eukaryotic cells?', back: 'Eukaryotic cells keep their DNA in a nucleus; prokaryotic cells have no nucleus.',
        keyPoints: ['nucleus', 'no nucleus'], quote: 'Prokaryotic cells, such as bacteria, have no nucleus; their DNA floats in the cytoplasm.',
        concept: 'Cell types', bloom: 'understand', importance: 3, history: [[8, 2], [6, 3], [1, 3]] },
      { type: 'cloze', front: 'Chloroplasts capture light energy and use it to make {{c1::glucose}} in photosynthesis.', back: 'glucose', keyPoints: ['glucose'],
        quote: 'Chloroplasts, found in plant cells, capture light energy and use it to make glucose in photosynthesis.', concept: 'Organelles',
        bloom: 'remember', importance: 2, history: [[6, 3], [4, 4]] },
      { type: 'why', front: 'Why do muscle cells contain thousands of mitochondria?', back: 'Muscle cells need a lot of energy, and mitochondria release energy as ATP through respiration.',
        keyPoints: ['need a lot of energy', 'ATP'], quote: 'Cells that need a lot of energy, such as muscle cells, contain thousands of mitochondria.',
        concept: 'Organelles', bloom: 'understand', importance: 2, history: [[5, 1], [5, 3], [2, 3]] },
      { type: 'basic', front: 'What does "selectively permeable" mean for the cell membrane?', back: 'Some molecules pass through freely while others need transport proteins.',
        keyPoints: ['some molecules pass freely', 'transport proteins'], quote: 'It is selectively permeable: small non-polar molecules such as oxygen pass through freely, while ions and glucose need transport proteins.',
        concept: 'Cell membrane', bloom: 'understand', importance: 3, history: [[4, 3]] },
      { type: 'cloze', front: 'The cell membrane is a {{c1::phospholipid bilayer}}.', back: 'phospholipid bilayer', keyPoints: ['phospholipid bilayer'],
        quote: 'The cell membrane is a phospholipid bilayer.', concept: 'Cell membrane', bloom: 'remember', importance: 2, history: [[3, 1], [3, 3]] },
      { type: 'basic', front: 'What is diffusion?', back: 'The net movement of particles from higher to lower concentration.', keyPoints: ['higher to lower concentration'],
        quote: 'Diffusion is the net movement of particles from an area of higher concentration to an area of lower concentration.',
        concept: 'Transport', bloom: 'remember', importance: 3, history: [[7, 3], [5, 3], [1, 4]] },
      { type: 'compare', front: 'Compare diffusion and active transport.', back: 'Diffusion moves particles down their concentration gradient with no energy; active transport moves them against it, using ATP and carrier proteins.',
        keyPoints: ['down the gradient, no energy', 'against the gradient, uses ATP'], quote: 'Active transport moves substances against their concentration gradient, from low to high concentration.',
        concept: 'Transport', bloom: 'analyze', importance: 3, history: [[2, 2]] },
      { type: 'basic', front: 'What is osmosis?', back: 'The diffusion of water across a selectively permeable membrane.', keyPoints: ['water', 'selectively permeable membrane'],
        quote: 'Osmosis is the diffusion of water across a selectively permeable membrane.', concept: 'Transport', bloom: 'remember', importance: 2, history: [] },
      { type: 'basic', front: 'Name an example of a carrier protein used in active transport.', back: 'The sodium-potassium pump', keyPoints: ['sodium-potassium pump'],
        quote: 'It uses energy from ATP and carrier proteins, such as the sodium-potassium pump.', concept: 'Transport', bloom: 'remember', importance: 1, history: [] },
      { type: 'why', front: 'Why does an enzyme stop working at high temperatures?', back: 'Heat changes the shape of the active site, so the substrate no longer fits and the enzyme is denatured.',
        keyPoints: ['active site changes shape', 'denatured'], quote: 'High temperatures change the shape of the active site, so the enzyme is denatured and stops working.',
        concept: 'Enzymes', bloom: 'understand', importance: 3, history: [] },
      { type: 'application', front: 'A student boils a solution of the enzyme amylase, cools it, then adds starch. Predict what happens and explain.', back: 'The starch is not broken down: boiling denatured the amylase, and cooling does not restore its active site.',
        keyPoints: ['starch not broken down', 'denatured', 'active site'], quote: 'High temperatures change the shape of the active site, so the enzyme is denatured and stops working.',
        concept: 'Enzymes', bloom: 'apply', importance: 2, history: [] },
      // Waiting in triage, so the visitor can try keep / edit / discard.
      { type: 'basic', front: 'What are enzymes made of?', back: 'Proteins', keyPoints: ['proteins'], quote: 'Enzymes are proteins that speed up chemical reactions without being used up.',
        concept: 'Enzymes', bloom: 'remember', importance: 2, history: null },
      { type: 'cloze', front: 'Each enzyme has an {{c1::active site}} that fits one substrate.', back: 'active site', keyPoints: ['active site'],
        quote: 'Each enzyme has an active site that fits one substrate.', concept: 'Enzymes', bloom: 'remember', importance: 2, history: null },
      { type: 'basic', front: 'Does diffusion need energy from the cell?', back: 'No', keyPoints: ['no'], quote: 'It needs no energy from the cell.',
        concept: 'Transport', bloom: 'remember', importance: 1, history: null },
      { type: 'basic', front: 'Which molecules pass through the membrane freely?', back: 'Small non-polar molecules such as oxygen', keyPoints: ['small non-polar molecules', 'oxygen'],
        quote: 'small non-polar molecules such as oxygen pass through freely', concept: 'Cell membrane', bloom: 'remember', importance: 2, history: null },
    ],
  },
  {
    title: 'The Industrial Revolution', subject: 'History', examInDays: null, sourceTitle: 'Chapter 7: Industry and empire', notes: [HISTORY_1],
    cards: [
      { type: 'basic', front: 'Where and when did the Industrial Revolution begin?', back: 'In Britain, in the late 1700s', keyPoints: ['Britain', 'late 1700s'],
        quote: 'The Industrial Revolution began in Britain in the late 1700s.', concept: 'Causes', bloom: 'remember', importance: 3, history: [[10, 3], [8, 3], [4, 3]] },
      { type: 'why', front: 'Why did the Industrial Revolution start in Britain?', back: 'Britain had coal and iron, a growing population, and money from overseas trade to invest in machines.',
        keyPoints: ['coal and iron', 'growing population', 'money from trade'], quote: 'Britain had large deposits of coal and iron, a growing population, and money from overseas trade to invest in new machines.',
        concept: 'Causes', bloom: 'understand', importance: 3, history: [[6, 2], [3, 3]] },
      { type: 'basic', front: 'What did James Watt add to the steam engine in 1769?', back: 'A separate condenser', keyPoints: ['separate condenser'],
        quote: 'James Watt improved the steam engine in 1769 by adding a separate condenser, which made it far more efficient.', concept: 'Steam power',
        bloom: 'remember', importance: 2, history: [[5, 3], [2, 1]] },
      { type: 'why', front: 'Why did steam engines change where factories could be built?', back: 'Factories no longer needed rivers for water power, so they could be built anywhere, such as in cities.',
        keyPoints: ['no longer needed rivers'], quote: 'Steam engines freed factories from needing to be built beside rivers.', concept: 'Steam power',
        bloom: 'understand', importance: 2, history: [] },
      { type: 'basic', front: 'What did the Factory Act of 1833 do?', back: 'It limited the hours children could work in textile mills.', keyPoints: ['limited children\'s hours'],
        quote: 'the Factory Act of 1833 limited the hours children could work in textile mills', concept: 'Working life', bloom: 'remember', importance: 2, history: [] },
    ],
  },
];

export const DEMO_ESSAY = {
  title: 'Should homework be optional?',
  type: 'argumentative' as const,
  gradeLevel: 'Grade 11',
  prompt: 'Should high schools make homework optional? Take a position and support it with reasons and evidence.',
  content: `High schools should make homework optional, because required homework often adds stress without improving learning.

Many students already spend seven hours a day in class. When they get home, they have jobs, sports, and family responsibilities. Homework piles on top of all this, and students end up staying awake late to finish it. Being tired the next day makes it harder to focus in class.

Some people argue that homework teaches discipline and responsibility. This is true for some students. However, students can learn responsibility in many other ways, like part-time jobs or caring for siblings. Homework is not the only way.

Also homework is often just busywork. Teachers assign worksheets that repeat what was done in class, and students copy answers from friends to get it done faster. This means the homework is not actually helping anyone learn.

In conclusion, homework should be optional. Students who want extra practice could still do it, and everyone else could rest and come to class ready to learn.`,
  strengths: [
    { paragraph_index: 0, quote: 'High schools should make homework optional, because required homework often adds stress without improving learning.',
      why: 'Your thesis takes a clear position and gives two reasons the rest of the essay can follow.' },
    { paragraph_index: 2, quote: 'Some people argue that homework teaches discipline and responsibility. This is true for some students.',
      why: 'You name the strongest counterargument and concede part of it, which makes your position more believable.' },
  ],
  rubricScores: [
    { criterion: 'Thesis', score: 3, justification: 'Clear and arguable, and it previews your reasons. It could say who decides what "optional" means.', confidence: 'high' },
    { criterion: 'Evidence', score: 2, justification: 'Your reasons are believable, but they rest on general claims with no data, study or specific example.', confidence: 'high' },
    { criterion: 'Analysis', score: 2, justification: 'Paragraph 2 explains the chain from homework to tiredness well; paragraph 4 asserts that busywork doesn\'t help without showing why.', confidence: 'medium' },
    { criterion: 'Organization', score: 3, justification: 'Logical order with a counterargument, though "Also" is a weak transition into your last reason.', confidence: 'high' },
    { criterion: 'Conventions', score: 4, justification: 'Clean grammar and spelling; one missing comma after an introductory word.', confidence: 'high' },
  ],
  promptAlignment: [
    { part: 'Take a position', status: 'addressed', note: 'Your first sentence states the position clearly.' },
    { part: 'Support it with reasons and evidence', status: 'partial', note: 'You give reasons, but no evidence a reader could check.' },
  ],
  outline: [
    { paragraph_index: 0, summary: 'Thesis: make homework optional, it adds stress without helping learning' },
    { paragraph_index: 1, summary: 'Reason 1: long days plus homework leave students tired' },
    { paragraph_index: 2, summary: 'Counterargument: homework teaches responsibility; rebuttal: other ways exist' },
    { paragraph_index: 3, summary: 'Reason 2: homework is often busywork that gets copied' },
    { paragraph_index: 4, summary: 'Conclusion: optional homework lets students rest or practise' },
  ],
  items: [
    { layer: 'global', category: 'evidence', rubric_criterion: 'Evidence', paragraph_index: 1, severity: 'high',
      quote: 'Homework piles on top of all this, and students end up staying awake late to finish it.',
      summary: 'Your main reason depends on how much sleep students lose, but the essay gives no evidence for it.',
      hints: ['What could a reader check to be sure students really stay up late because of homework?', 'A survey result, a study on teen sleep, or one specific example from your school would turn this claim into evidence.'] },
    { layer: 'paragraph', category: 'analysis', rubric_criterion: 'Analysis', paragraph_index: 3, severity: 'high',
      quote: 'This means the homework is not actually helping anyone learn.',
      summary: 'The paragraph jumps from "students copy answers" to "it helps no one" without explaining the link.',
      hints: ['If a student copies a worksheet, what exactly did they miss that the worksheet was meant to give them?', 'Explain the step between copying and not learning: practice only works when you do the thinking yourself.'] },
    { layer: 'paragraph', category: 'counterargument', rubric_criterion: 'Analysis', paragraph_index: 2, severity: 'medium',
      quote: 'However, students can learn responsibility in many other ways, like part-time jobs or caring for siblings.',
      summary: 'The rebuttal names alternatives but doesn\'t show they teach the same habits homework is meant to.',
      hints: ['Does a part-time job build the same kind of responsibility as finishing schoolwork on your own?', 'Pick one alternative and show what habit it builds, then compare it with what homework builds.'] },
    { layer: 'paragraph', category: 'transitions', rubric_criterion: 'Organization', paragraph_index: 3, severity: 'low',
      quote: 'Also homework is often just busywork.',
      summary: '"Also" adds a reason without showing how it relates to the last one.',
      hints: ['How does this reason connect to the one about stress and sleep?', 'A transition that names the relationship ("Even when students have time, …") guides the reader better than "Also".'] },
    { layer: 'global', category: 'conclusion', rubric_criterion: 'Organization', paragraph_index: 4, severity: 'low',
      quote: 'In conclusion, homework should be optional.',
      summary: 'The conclusion restates the thesis instead of showing what your reasons add up to.',
      hints: ['After reading your essay, what should a principal do differently on Monday?', 'End with the consequence of your argument, not a repeat of the first sentence.'] },
    { layer: 'sentence', category: 'punctuation', rubric_criterion: 'Conventions', paragraph_index: 3, severity: 'low',
      quote: 'Also homework', summary: 'Add a comma after an introductory word like "Also".', hints: [], replacements: ['Also, homework'], convention: true },
  ],
};
