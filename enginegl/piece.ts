import type { ParamSchema, ParamValues, PieceMeta } from '../engine2d';

/**
 * A fragment-shader piece. `fragment` defines a Shadertoy-style
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord)
 * with params available as uniforms named u_<key>. See prelude.ts for
 * everything else in scope (iTime, iPhase, iResolution, noise, …).
 */
export interface ShaderPiece<S extends ParamSchema = ParamSchema> extends PieceMeta<S> {
  engine: 'shader';
  fragment: string;
  /**
   * Images sampled as `uniform sampler2D tex_<key>`, mipmapped. Called on
   * every param change; the image is re-uploaded only when a different object
   * comes back, so memoize expensive drawing.
   */
  textures?: Record<string, TextureDraw<S> | TextureSpec<S>>;
}

type TextureDraw<S extends ParamSchema> = (values: ParamValues<S>) => TexImageSource;

export interface TextureSpec<S extends ParamSchema = ParamSchema> {
  draw: TextureDraw<S>;
  /** Tile instead of clamping at the edges. */
  repeat?: boolean;
  /** Data (normals, heights…) rather than colour: no sRGB decoding. */
  data?: boolean;
}

export function defineShader<const S extends ParamSchema>(piece: Omit<ShaderPiece<S>, 'engine'>): ShaderPiece<S> {
  return { ...piece, engine: 'shader' };
}
