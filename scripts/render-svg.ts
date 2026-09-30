// Render a 2D piece to SVG from the command line (default params).
//   npm run render:svg -- <piece-id> [seed] [out.svg]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaults, renderToSvg, type AnyPiece } from '../engine2d';

const [id, seedArg = '1', out] = process.argv.slice(2);
if (!id) {
  console.error('usage: npm run render:svg -- <piece-id> [seed] [out.svg]');
  process.exit(1);
}

const { default: piece } = (await import(`../pieces/2d/${id}/index.ts`)) as { default: AnyPiece };
const seed = Number(seedArg);
const file = out ?? `renders/${id}-${seed}.svg`;

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, renderToSvg(piece, defaults(piece.params), seed));
console.log(file);
