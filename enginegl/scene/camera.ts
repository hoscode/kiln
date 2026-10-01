// Column-major 4×4 matrices and the scene's camera views (z is up).
import type { SceneCamera, View } from './piece';

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rad = (d: number) => (d * Math.PI) / 180;

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const f = normalize(sub(target, eye));
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]);
}

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
  return new Float32Array([-2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0, (l + r) * lr, (t + b) * bt, (f + n) * nf, 1]);
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  return out;
}

interface ViewSpec {
  ortho: boolean;
  pitch: number;
  yaw: number;
  fov: number;
}

export const VIEWS: Record<View, ViewSpec> = {
  top: { ortho: true, pitch: 90, yaw: -90, fov: 0 },
  isometric: { ortho: true, pitch: 35.264, yaw: -45, fov: 0 },
  angled: { ortho: false, pitch: 36, yaw: -62, fov: 30 },
  low: { ortho: false, pitch: 13, yaw: -72, fov: 24 },
};

export interface FrameWindow {
  width: number;
  height: number;
  /** Strip rendering: rows [offsetY, offsetY + tileHeight) of the full frame. */
  offsetY: number;
  tileHeight: number;
}

export interface CameraState {
  viewProj: Mat4;
  eye: Vec3;
  viewDir: Vec3;
  target: Vec3;
  ortho: boolean;
  /** Radius around the target worth covering with shadow maps. */
  reach: number;
}

/** The preset for `cam.view`, with any explicit tilt / turn / projection / fov applied. */
export function resolveView(cam: SceneCamera): ViewSpec {
  const base = VIEWS[cam.view ?? 'angled'];
  return {
    ortho: cam.projection ? cam.projection === 'orthographic' : base.ortho,
    pitch: cam.tilt !== undefined ? 90 - Math.min(89.5, Math.max(0, cam.tilt)) : base.pitch,
    yaw: cam.turn ?? base.yaw,
    fov: cam.fov ?? (base.fov || 30),
  };
}

/**
 * Camera for one sub-sample. `jitter` is a sub-pixel offset (pixels) for
 * anti-aliasing; `lens` is a unit-disk sample for depth of field.
 */
export function cameraState(cam: SceneCamera, phase: number, win: FrameWindow, jitter: [number, number], lens: [number, number]): CameraState {
  const spec = resolveView(cam);
  const aspect = win.width / win.height;
  const yaw = rad(spec.yaw) + Math.PI * 2 * (cam.orbit ?? 0) * phase + (cam.sway ?? 0) * Math.sin(Math.PI * 2 * phase);
  const pitch = rad(spec.pitch);
  const target: Vec3 = [cam.target?.[0] ?? 0, cam.target?.[1] ?? 0, 0];
  const dir: Vec3 = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  // Screen-up is the far side of the floor; well defined even looking straight down.
  const up: Vec3 = [-Math.cos(yaw), -Math.sin(yaw), 0];

  let proj: Mat4;
  let dist: number;
  if (spec.ortho) {
    dist = cam.zoom * 8 + 20;
    proj = ortho(-cam.zoom * aspect, cam.zoom * aspect, -cam.zoom, cam.zoom, 0.1, dist * 2);
  } else {
    const fov = rad(spec.fov);
    dist = cam.zoom / Math.tan(fov / 2);
    proj = perspective(fov, aspect, dist * 0.05, dist * 12);
  }

  let eye = add(target, dir, dist);
  const center = eye;
  if (!spec.ortho && cam.dof) {
    // Thin-lens depth of field: move the eye across the aperture, keep aiming at the target (focus plane).
    const f = normalize(sub(target, center));
    const right = normalize(cross(f, up));
    const camUp = cross(right, f);
    const a = cam.dof * dist * 0.025;
    eye = add(add(center, right, lens[0] * a), camUp, lens[1] * a);
  }
  const view = lookAt(eye, target, up);

  // Map the requested strip of the full frame onto the canvas, plus AA jitter.
  const sy = win.height / win.tileHeight;
  const yTop = 1 - (2 * win.offsetY) / win.height;
  const yBot = 1 - (2 * (win.offsetY + win.tileHeight)) / win.height;
  const ty = -(yTop + yBot) / (yTop - yBot);
  const jx = (2 * jitter[0]) / win.width;
  const jy = (2 * jitter[1]) / win.height;
  const windowM = new Float32Array([1, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, jx, sy * jy + ty, 0, 1]);

  return {
    viewProj: mul(windowM, mul(proj, view)),
    eye,
    viewDir: normalize(sub(target, eye)),
    target,
    ortho: spec.ortho,
    // Oblique cameras see further, so shadows must cover more floor.
    reach: cam.zoom * (aspect * 1.4 + (spec.ortho ? 0.5 : 3.5) * Math.cos(pitch)),
  };
}

/** Orthographic light looking at `target` from direction `dir`, covering radius r. */
export function lightMatrix(target: Vec3, dir: Vec3, r: number): { matrix: Mat4; range: number } {
  const d = r + 10;
  const eye = add(target, dir, d);
  const up: Vec3 = Math.abs(dir[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  const near = d - r - 3, far = d + r + 3;
  return { matrix: mul(ortho(-r, r, -r, r, near, far), lookAt(eye, target, up)), range: far - near };
}

/**
 * Whether a floor point is ever in frame over the loop (sway / orbit
 * included). `margin` > 1 widens the frame, e.g. to catch tiles half in view.
 */
export function inFrame(cam: SceneCamera, aspect: number, margin = 1.15): (x: number, y: number) => boolean {
  const win: FrameWindow = { width: aspect * 1000, height: 1000, offsetY: 0, tileHeight: 1000 };
  const views = Array.from({ length: 16 }, (_, k) => cameraState({ ...cam, dof: 0 }, k / 16, win, [0, 0], [0, 0]).viewProj);
  return (x, y) =>
    views.some((m) => {
      const w = m[3] * x + m[7] * y + m[15];
      return w > 0 && Math.abs((m[0] * x + m[4] * y + m[12]) / w) < margin && Math.abs((m[1] * x + m[5] * y + m[13]) / w) < margin;
    });
}
