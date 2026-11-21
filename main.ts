// Entry driver for the make.fun csv-reader speed bounty.
// The harness runs this file with node 22. It reads its cases from /input/cases.json
// and writes one answer per case, in order, to /output/answers.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// The house baseline turns V8's incremental marking off before it imports its
// reader; do the same so the comparison is on the reader itself.
setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = [];
for (const item of cases) answers.push(run(item.input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
