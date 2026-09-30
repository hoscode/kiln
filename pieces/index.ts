// Registry: every pieces/<engine>/<id>/index.ts with a default-exported piece.
import type { KilnPiece } from '../runtime';

const modules = import.meta.glob<{ default: KilnPiece }>(['./2d/*/index.ts', './shader/*/index.ts'], { eager: true });

export const pieces: KilnPiece[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title));
