// Typed parameter schemas. The UI builds controls from these, and Claude
// (via MCP, later) reads and sets params through the same schema.
import { paletteNames } from './palettes';

interface Base {
  label?: string;
  /** UI section; params without one go under "Parameters". */
  group?: string;
}
export interface NumberParam extends Base { kind: 'number'; default: number; min: number; max: number; step: number }
export interface IntParam extends Base { kind: 'int'; default: number; min: number; max: number }
export interface BoolParam extends Base { kind: 'bool'; default: boolean }
export interface ColorParam extends Base { kind: 'color'; default: string }
export interface PaletteParam extends Base { kind: 'palette'; default: string }
export interface ChoiceParam<T extends string = string> extends Base { kind: 'choice'; default: T; options: readonly T[] }

export type Param = NumberParam | IntParam | BoolParam | ColorParam | PaletteParam | ChoiceParam;
export type ParamSchema = Record<string, Param>;

export type ParamValue<P extends Param> = P extends NumberParam | IntParam
  ? number
  : P extends BoolParam
    ? boolean
    : P extends ChoiceParam<infer T>
      ? T
      : string;
export type ParamValues<S extends ParamSchema> = { [K in keyof S]: ParamValue<S[K]> };

export const num = (value: number, min: number, max: number, step = (max - min) / 100, label?: string): NumberParam =>
  ({ kind: 'number', default: value, min, max, step, label });
export const int = (value: number, min: number, max: number, label?: string): IntParam =>
  ({ kind: 'int', default: value, min, max, label });
export const bool = (value: boolean, label?: string): BoolParam => ({ kind: 'bool', default: value, label });
export const color = (value: string, label?: string): ColorParam => ({ kind: 'color', default: value, label });
export const palette = (value: string, label?: string): PaletteParam => ({ kind: 'palette', default: value, label });
export const choice = <const T extends string>(options: readonly T[], value: T, label?: string): ChoiceParam<T> =>
  ({ kind: 'choice', default: value, options, label });

/** Put every param in `schema` under one UI section: { ...group('Camera', { … }) }. */
export function group<S extends ParamSchema>(name: string, schema: S): S {
  return Object.fromEntries(Object.entries(schema).map(([k, p]) => [k, { ...p, group: name }])) as S;
}

export function defaults<S extends ParamSchema>(schema: S): ParamValues<S> {
  return Object.fromEntries(Object.entries(schema).map(([k, p]) => [k, p.default])) as ParamValues<S>;
}

/** Stored values merged over defaults; drops keys the schema no longer has. */
export function resolve<S extends ParamSchema>(schema: S, stored: Record<string, unknown> = {}): ParamValues<S> {
  const out: Record<string, unknown> = defaults(schema);
  for (const [k, p] of Object.entries(schema)) {
    if (k in stored && typeof stored[k] === typeof p.default) out[k] = stored[k];
  }
  return out as ParamValues<S>;
}

/** Random values within each param's range — for exploring. */
export function randomValues(schema: ParamSchema, rnd: () => number = Math.random): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(schema)) {
    switch (p.kind) {
      case 'number':
        out[k] = Math.round((p.min + (p.max - p.min) * rnd()) / p.step) * p.step;
        break;
      case 'int':
        out[k] = Math.floor(p.min + (p.max - p.min + 1) * rnd());
        break;
      case 'bool':
        out[k] = rnd() < 0.5;
        break;
      case 'palette':
        out[k] = paletteNames[Math.floor(rnd() * paletteNames.length)];
        break;
      case 'choice':
        out[k] = p.options[Math.floor(rnd() * p.options.length)];
        break;
      case 'color':
        out[k] = p.default;
        break;
    }
  }
  return out;
}
