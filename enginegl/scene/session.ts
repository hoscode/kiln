import { fract, hexToRgb, timeContext, type FrameOptions, type Session } from '../../engine2d';
import { FULLSCREEN_VS } from '../session';
import { cameraState, lightMatrix, normalize, type CameraState, type Vec3 } from './camera';
import { FLOATS_PER_VERTEX, groundMesh, slabMesh } from './mesh';
import type { Motion, Scene, ScenePiece } from './piece';
import { ACCUM_FS, DEPTH_FS, DEPTH_VS, POST_FS, SCENE_FS, SCENE_VS } from './shaders';

type Values = Record<string, unknown>;

const SHADOW_SIZE = 2048;
const TEXTURES = { plain: 0, marble: 1, brushed: 2, ceramic: 3 } as const;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = (hex: string) => hexToRgb(hex).map(toLinear) as Vec3;

class Program {
  readonly p: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();

  constructor(private gl: WebGL2RenderingContext, vs: string, fs: string, label: string) {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${label} shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    this.p = gl.createProgram()!;
    gl.attachShader(this.p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.p);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error(`${label} link: ${gl.getProgramInfoLog(this.p)}`);
  }

  u(name: string) {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.p, name));
    return this.locs.get(name)!;
  }
}

interface ShapeBatch {
  vao: WebGLVertexArrayObject;
  vertices: number;
  count: number;
}

interface Built {
  scene: Scene;
  motion: Motion;
  /** Instances sorted by shape; order[j] = original index. */
  order: Uint32Array;
  motionData: Float32Array;
  motionBuf: WebGLBuffer;
  glowData: Float32Array;
  glowBuf: WebGLBuffer;
  batches: ShapeBatch[];
  ground?: ShapeBatch;
  buffers: WebGLBuffer[];
}

/** Low-discrepancy (R2) point in [0,1)² for sub-sample s. */
const r2 = (s: number): [number, number] => [fract(0.5 + s * 0.7548776662), fract(0.5 + s * 0.569840291)];

/** Even unit-disk sample (golden-angle spiral). */
function disk(s: number, n: number): [number, number] {
  const r = Math.sqrt((s + 0.5) / n);
  const a = s * 2.399963229728653;
  return [r * Math.cos(a), r * Math.sin(a)];
}

export class SceneSession implements Session {
  readonly canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private hdr: number;
  private main: Program;
  private depth: Program;
  private accum: Program;
  private post: Program;
  private fb: Record<'msaa' | 'resolve' | 'accum' | 'shadow' | 'ao', WebGLFramebuffer>;
  private tex: Record<'resolve' | 'accum' | 'shadow' | 'ao', WebGLTexture>;
  private built!: Built;
  private levels: number;

  constructor(
    private piece: ScenePiece,
    private values: Values,
    private seed: number,
    readonly width: number,
    readonly height: number,
    readonly tileHeight = height,
  ) {
    this.canvas = new OffscreenCanvas(width, tileHeight);
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    // Half-float HDR buffers when available; 8-bit fallback otherwise.
    this.hdr = gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : gl.RGBA8;

    this.main = new Program(gl, SCENE_VS, SCENE_FS, 'Scene');
    this.depth = new Program(gl, DEPTH_VS, DEPTH_FS, 'Depth');
    this.accum = new Program(gl, FULLSCREEN_VS, ACCUM_FS, 'Accumulate');
    this.post = new Program(gl, FULLSCREEN_VS, POST_FS, 'Post');

    const w = width, h = tileHeight;
    const colorTex = (levels = 1) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, levels, this.hdr, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, levels > 1 ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const depthTex = (size: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const framebuffer = (attach: (fb: WebGLFramebuffer) => void) => {
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      attach(fb);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete (0x${status.toString(16)})`);
      return fb;
    };

    // The accumulation buffer keeps a mip chain: blurred levels feed bloom.
    this.levels = Math.min(8, Math.floor(Math.log2(Math.max(1, Math.min(w, h)))) + 1);
    this.tex = { resolve: colorTex(), accum: colorTex(this.levels), shadow: depthTex(SHADOW_SIZE), ao: depthTex(SHADOW_SIZE) };

    const supported = gl.getInternalformatParameter(gl.RENDERBUFFER, this.hdr, gl.SAMPLES) as Int32Array | null;
    const samples = Math.min(4, supported?.[0] ?? 0);
    this.fb = {
      msaa: framebuffer(() => {
        const color = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, this.hdr, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        const depth = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      }),
      resolve: framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex.resolve, 0)),
      accum: framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex.accum, 0)),
      shadow: framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tex.shadow, 0)),
      ao: framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tex.ao, 0)),
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.build();
  }

  update(values: Values, seed: number) {
    this.values = values;
    this.seed = seed;
    this.release();
    this.build();
  }

  render(t: number, opts: FrameOptions = {}, offsetY = 0) {
    const gl = this.gl;
    const { scene } = this.built;
    const anim = this.piece.animation;
    const fps = anim?.fps ?? 60;
    const n = Math.max(1, Math.round(opts.samples ?? 1));
    const shutter = opts.shutter ?? 0.5;
    const win = { width: this.width, height: this.height, offsetY, tileHeight: this.tileHeight };

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.accum);
    gl.viewport(0, 0, this.width, this.tileHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (let s = 0; s < n; s++) {
      const ts = n > 1 ? t + (((s + 0.5) / n - 0.5) * shutter) / fps : t;
      const phase = anim?.duration ? fract(ts / anim.duration) : 0;
      this.animate(ts);
      const jitter = n > 1 ? (r2(s).map((v) => v - 0.5) as [number, number]) : ([0, 0] as [number, number]);
      const cam = cameraState(scene.camera, phase, win, jitter, n > 1 ? disk(s, n) : [0, 0]);
      const light = this.lightDir();
      const key = lightMatrix(cam.target, light, cam.reach);
      const top = lightMatrix(cam.target, [0, 0, 1], cam.reach);

      this.depthPass(this.fb.shadow, key.matrix);
      this.depthPass(this.fb.ao, top.matrix);
      this.mainPass(cam, light, key, top, s);

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fb.msaa);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fb.resolve);
      gl.blitFramebuffer(0, 0, this.width, this.tileHeight, 0, 0, this.width, this.tileHeight, gl.COLOR_BUFFER_BIT, gl.NEAREST);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.accum);
      gl.viewport(0, 0, this.width, this.tileHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.accum.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.resolve);
      gl.uniform1i(this.accum.u('u_src'), 0);
      gl.uniform1f(this.accum.u('u_weight'), 1 / n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }

    const post = scene.post ?? {};
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.tileHeight);
    gl.useProgram(this.post.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.accum);
    if ((post.bloom ?? 0) > 0) gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(this.post.u('u_accum'), 0);
    gl.uniform1f(this.post.u('u_bloom'), post.bloom ?? 0);
    gl.uniform1f(this.post.u('u_levels'), this.levels - 1);
    gl.uniform2f(this.post.u('u_resolution'), this.width, this.height);
    gl.uniform2f(this.post.u('u_offset'), 0, this.height - offsetY - this.tileHeight);
    gl.uniform1f(this.post.u('u_exposure'), post.exposure ?? 1);
    gl.uniform1f(this.post.u('u_vignette'), post.vignette ?? 0.3);
    gl.uniform1f(this.post.u('u_grain'), post.grain ?? 0.02);
    gl.uniform1f(this.post.u('u_frame'), Math.round(t * fps));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  readRows(rows: number) {
    const gl = this.gl;
    const w = this.width;
    const buf = new Uint8Array(w * rows * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, this.tileHeight - rows, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(buf.length);
    const stride = w * 4;
    for (let y = 0; y < rows; y++) out.set(buf.subarray(y * stride, (y + 1) * stride), (rows - 1 - y) * stride);
    return out;
  }

  bitmap() {
    return createImageBitmap(this.canvas);
  }

  dispose() {
    this.release();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // --- internals ---

  private lightDir(): Vec3 {
    const { azimuth, elevation } = this.built.scene.light;
    const az = (azimuth * Math.PI) / 180, el = (elevation * Math.PI) / 180;
    return normalize([Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]);
  }

  private build() {
    const gl = this.gl;
    const piece = this.piece;
    const scene = piece.build(timeContext(piece, this.values, this.seed, 0));
    const count = scene.instances.length;
    const order = Uint32Array.from(scene.instances.keys()).sort((a, b) => scene.instances[a].shape - scene.instances[b].shape);
    const motion: Motion = {
      flip: new Float32Array(count),
      axis: new Float32Array(count),
      lift: new Float32Array(count),
      scale: new Float32Array(count).fill(1),
      glow: new Float32Array(count),
    };
    const buffers: WebGLBuffer[] = [];
    const buffer = (data: Float32Array, usage: number) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      buffers.push(b);
      return b;
    };

    // Static per-instance data, in shape-sorted order.
    const place = new Float32Array(count * 4);
    const mats = new Float32Array(count * 2);
    order.forEach((i, j) => {
      const inst = scene.instances[i];
      place.set([inst.x, inst.y, inst.angle, fract(Math.sin(i * 12.9898 + this.seed * 78.233) * 43758.5453)], j * 4);
      mats.set([inst.front, inst.back], j * 2);
    });
    const placeBuf = buffer(place, gl.STATIC_DRAW);
    const matsBuf = buffer(mats, gl.STATIC_DRAW);
    const motionData = new Float32Array(count * 4);
    const motionBuf = buffer(motionData, gl.DYNAMIC_DRAW);
    const glowData = new Float32Array(count);
    const glowBuf = buffer(glowData, gl.DYNAMIC_DRAW);

    const meshVao = (mesh: Float32Array) => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      buffer(mesh, gl.STATIC_DRAW);
      const stride = FLOATS_PER_VERTEX * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
      return vao;
    };
    const instanced = (loc: number, buf: WebGLBuffer, size: number, first: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, size * 4, first * size * 4);
      gl.vertexAttribDivisor(loc, 1);
    };

    const batches: ShapeBatch[] = [];
    let first = 0;
    scene.shapes.forEach((outline, shape) => {
      let n = 0;
      while (first + n < count && scene.instances[order[first + n]].shape === shape) n++;
      if (n > 0) {
        const mesh = slabMesh(outline, scene.thickness, scene.bevel);
        const vao = meshVao(mesh);
        instanced(3, placeBuf, 4, first);
        instanced(4, matsBuf, 2, first);
        instanced(5, motionBuf, 4, first);
        instanced(6, glowBuf, 1, first);
        batches.push({ vao, vertices: mesh.length / FLOATS_PER_VERTEX, count: n });
      }
      first += n;
    });

    let ground: ShapeBatch | undefined;
    if (scene.ground !== null) {
      const mesh = groundMesh(scene.camera.zoom * 40 + 50, -scene.thickness / 2 - 0.002);
      ground = { vao: meshVao(mesh), vertices: 6, count: 1 };
    }
    gl.bindVertexArray(null);

    this.built = { scene, motion, order, motionData, motionBuf, glowData, glowBuf, batches, ground, buffers };
  }

  private release() {
    if (!this.built) return;
    const gl = this.gl;
    for (const b of this.built.batches) gl.deleteVertexArray(b.vao);
    if (this.built.ground) gl.deleteVertexArray(this.built.ground.vao);
    for (const b of this.built.buffers) gl.deleteBuffer(b);
  }

  private animate(t: number) {
    const { scene, motion, order, motionData, motionBuf, glowData, glowBuf } = this.built;
    this.piece.animate(timeContext(this.piece, this.values, this.seed, t), scene, motion);
    for (let j = 0; j < order.length; j++) {
      const i = order[j];
      motionData[j * 4] = motion.flip[i];
      motionData[j * 4 + 1] = motion.axis[i];
      motionData[j * 4 + 2] = motion.lift[i];
      motionData[j * 4 + 3] = motion.scale[i];
      glowData[j] = motion.glow[i];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, motionBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, motionData);
    gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, glowData);
  }

  private drawTiles() {
    const gl = this.gl;
    for (const b of this.built.batches) {
      gl.bindVertexArray(b.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, b.vertices, b.count);
    }
    gl.bindVertexArray(null);
  }

  private depthPass(fb: WebGLFramebuffer, matrix: Float32Array) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    gl.useProgram(this.depth.p);
    gl.uniformMatrix4fv(this.depth.u('u_viewProj'), false, matrix);
    gl.uniform1f(this.depth.u('u_gap'), this.built.scene.gap);
    this.drawTiles();
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  private mainPass(
    cam: CameraState,
    light: Vec3,
    key: { matrix: Float32Array; range: number },
    top: { matrix: Float32Array; range: number },
    sample: number,
  ) {
    const gl = this.gl;
    const { scene, ground } = this.built;
    const p = this.main;
    const env = scene.environment;
    const horizon = linear(env.horizon);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb.msaa);
    gl.viewport(0, 0, this.width, this.tileHeight);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(horizon[0], horizon[1], horizon[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u('u_viewProj'), false, cam.viewProj);
    gl.uniform1f(p.u('u_gap'), scene.gap);
    gl.uniform3fv(p.u('u_eye'), cam.eye);
    gl.uniform3fv(p.u('u_viewDir'), cam.viewDir);
    gl.uniform1f(p.u('u_ortho'), cam.ortho ? 1 : 0);
    gl.uniform3fv(p.u('u_target'), cam.target);

    const lc = linear(scene.light.color ?? '#ffffff').map((c) => c * (scene.light.intensity ?? 3));
    gl.uniform3fv(p.u('u_lightDir'), light);
    gl.uniform3fv(p.u('u_lightColor'), lc);
    const glow = scene.glow ?? { color: '#000000' };
    gl.uniform3fv(p.u('u_glowColor'), linear(glow.color).map((c) => c * (glow.intensity ?? 4)));
    gl.uniform3fv(p.u('u_sky'), linear(env.sky));
    gl.uniform3fv(p.u('u_horizon'), horizon);
    gl.uniform3fv(p.u('u_envGround'), linear(env.ground));
    gl.uniform1f(p.u('u_fog'), (scene.camera.fog ?? 0) * 0.004);

    const matA = new Float32Array(32);
    const matB = new Float32Array(32);
    scene.materials.slice(0, 8).forEach((m, i) => {
      matA.set([...linear(m.color), m.roughness], i * 4);
      matB.set([m.metal, TEXTURES[m.texture ?? 'plain'], m.textureScale ?? 1, m.textureStrength ?? 1], i * 4);
    });
    gl.uniform4fv(p.u('u_matA[0]'), matA);
    gl.uniform4fv(p.u('u_matB[0]'), matB);
    gl.uniform1f(p.u('u_edgeMat'), scene.edge);
    gl.uniform1f(p.u('u_groundMat'), scene.ground ?? 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.shadow);
    gl.uniform1i(p.u('u_shadowMap'), 1);
    gl.uniformMatrix4fv(p.u('u_shadowMatrix'), false, key.matrix);
    gl.uniform1f(p.u('u_shadowRange'), key.range);
    gl.uniform1f(p.u('u_shadowSoft'), 0.0005 + (scene.light.softness ?? 0.4) * 0.004);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.ao);
    gl.uniform1i(p.u('u_aoMap'), 2);
    gl.uniformMatrix4fv(p.u('u_aoMatrix'), false, top.matrix);
    gl.uniform1f(p.u('u_aoRange'), top.range);
    gl.uniform1f(p.u('u_aoRadius'), 0.45 / (2 * cam.reach)); // ~0.45 world units
    gl.uniform1f(p.u('u_sample'), sample);

    if (ground) {
      gl.bindVertexArray(ground.vao);
      // Instance attributes are disabled for the ground; feed constants.
      gl.vertexAttrib4f(3, 0, 0, 0, 0.5);
      gl.vertexAttrib2f(4, 0, 0);
      gl.vertexAttrib4f(5, 0, 0, 0, 1);
      gl.vertexAttrib1f(6, 0);
      gl.drawArrays(gl.TRIANGLES, 0, ground.vertices);
    }
    this.drawTiles();
  }
}
