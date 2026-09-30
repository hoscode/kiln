// Registry: every pieces/2d/<id>/index.ts with a default-exported piece.
import type { AnyPiece } from '../../engine2d';

const modules = import.meta.glob<{ default: AnyPiece }>('./*/index.ts', { eager: true });

export const pieces: AnyPiece[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.title.localeCompare(b.title));
