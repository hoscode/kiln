// Scene pieces: many beveled slabs (tiles) lit by a physically based renderer.
// A piece builds the scene once per (params, seed), then animates each tile
// per frame by writing flip / lift / scale into `Motion`.
import type { ParamSchema, ParamValues, PieceMeta, TimeContext, Vec2 } from '../../engine2d';

export type SurfaceTexture = 'plain' | 'marble' | 'brushed' | 'ceramic';
export type View = 'top' | 'isometric' | 'angled' | 'low';

export interface Material {
  color: string;
  roughness: number;
  metal: number;
  texture?: SurfaceTexture;
  /** Texture features per tile edge length. */
  textureScale?: number;
  textureStrength?: number;
}

export interface Instance {
  /** Index into Scene.shapes. */
  shape: number;
  x: number;
  y: number;
  /** Rotation of the shape in the ground plane. */
  angle: number;
  /** Material indices for the top and bottom faces. */
  front: number;
  back: number;
}

export interface SceneCamera {
  /** Preset; the fields below override it. */
  view?: View;
  /** Degrees away from straight down: 0 = top view, 90 = level with the floor. */
  tilt?: number;
  /** Heading around the vertical, degrees. */
  turn?: number;
  projection?: 'perspective' | 'orthographic';
  /** Vertical field of view for perspective, degrees. */
  fov?: number;
  /** Half the visible height at the target, in world units. */
  zoom: number;
  target?: Vec2;
  /** Side-to-side sway, radians, once per loop. */
  sway?: number;
  /** Whole orbits per loop. */
  orbit?: number;
  /** Depth of field, 0..1 (perspective views; needs samples > 1). */
  dof?: number;
  /** Distance haze, 0..1. */
  fog?: number;
}

export interface SceneLight {
  /** Degrees around the vertical. */
  azimuth: number;
  /** Degrees above the ground. */
  elevation: number;
  color?: string;
  intensity?: number;
  /** Shadow penumbra, 0..1. */
  softness?: number;
}

export interface Scene<D = unknown> {
  /** Outlines (any convex polygon), extruded into beveled slabs. */
  shapes: Vec2[][];
  thickness: number;
  bevel: number;
  /** Footprint scale per tile (1 − grout). */
  gap: number;
  instances: Instance[];
  /** Up to 8. */
  materials: Material[];
  /** Material for bevels and sides. */
  edge: number;
  /** Material for the floor, or null for none. */
  ground: number | null;
  camera: SceneCamera;
  light: SceneLight;
  environment: { sky: string; horizon: string; ground: string };
  /** Emissive colour for Motion.glow (bevels glow fully, faces as a soft rim). */
  glow?: { color: string; intensity?: number };
  post?: { exposure?: number; vignette?: number; grain?: number; bloom?: number };
  /** Anything the piece wants to carry from build() to animate(). */
  data: D;
}

/** Per-instance animation, indexed like Scene.instances. */
export interface Motion {
  /** Rotation about the in-plane flip axis, radians. */
  flip: Float32Array;
  /** Direction of the flip axis in the ground plane, radians. */
  axis: Float32Array;
  /** Height above the resting position. */
  lift: Float32Array;
  /** Uniform scale (0 hides a tile). */
  scale: Float32Array;
  /** Emission 0..1+, coloured by Scene.glow. */
  glow: Float32Array;
}

export interface ScenePiece<S extends ParamSchema = ParamSchema, D = unknown> extends PieceMeta<S> {
  engine: 'scene';
  build(ctx: TimeContext<ParamValues<S>>): Scene<D>;
  animate(ctx: TimeContext<ParamValues<S>>, scene: Scene<D>, out: Motion): void;
}

export function defineScene<const S extends ParamSchema, D>(piece: Omit<ScenePiece<S, D>, 'engine'>): ScenePiece<S, D> {
  return { ...piece, engine: 'scene' };
}
