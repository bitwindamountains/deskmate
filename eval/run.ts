import { join } from 'node:path';
import { runEval } from './runEval.js';

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const providerId = at >= 0 ? args[at + 1] : undefined;
const outDir = join('eval', 'out', new Date().toISOString().replace(/:/g, '-'));

await runEval({ samplesDir: join('eval', 'samples'), outDir, env: process.env, providerId });
console.log(`\nSummary: ${join(outDir, 'summary.csv')}`);
