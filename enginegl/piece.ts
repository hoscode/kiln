import type { ParamSchema, PieceMeta } from '../engine2d';

/**
 * A fragment-shader piece. `fragment` defines a Shadertoy-style
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord)
 * with params available as uniforms named u_<key>. See prelude.ts for
 * everything else in scope (iTime, iPhase, iResolution, noise, …).
 */
export interface ShaderPiece<S extends ParamSchema = ParamSchema> extends PieceMeta<S> {
  engine: 'shader';
  fragment: string;
}

export function defineShader<const S extends ParamSchema>(piece: Omit<ShaderPiece<S>, 'engine'>): ShaderPiece<S> {
  return { ...piece, engine: 'shader' };
}
