import { getPalette, hexToRgb, type FrameOptions, type Session } from '../engine2d';
import type { ShaderPiece } from './piece';
import { MAIN, PRELUDE, paramUniforms } from './prelude';

type Values = Record<string, unknown>;

// Full-screen triangle, no buffers needed.
export const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export class GLSession implements Session {
  readonly canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private piece: ShaderPiece,
    values: Values,
    seed: number,
    readonly width: number,
    readonly height: number,
    readonly tileHeight = height,
  ) {
    this.canvas = new OffscreenCanvas(width, tileHeight);
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.program = this.compile();
    gl.useProgram(this.program);
    gl.viewport(0, 0, width, tileHeight);

    this.update(values, seed);
    gl.uniform2f(this.u('u_resolution'), width, height);
    this.set1f('u_duration', piece.animation?.duration ?? 0);
    this.set1f('u_fps', piece.animation?.fps ?? 60);
  }

  update(values: Values, seed: number) {
    this.set1f('u_seed', seed);
    this.setParams(values);
  }

  render(t: number, opts: FrameOptions = {}, offsetY = 0) {
    const gl = this.gl;
    const fps = this.piece.animation?.fps ?? 60;
    this.set1f('u_time', t);
    this.set1f('u_frame', Math.round(t * fps));
    this.set1f('u_shutter', opts.shutter ?? 0.5);
    gl.uniform1i(this.u('u_samples'), Math.max(1, Math.round(opts.samples ?? 1)));
    // GL's origin is bottom-left; strips are counted from the top.
    gl.uniform2f(this.u('u_offset'), 0, this.height - offsetY - this.tileHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  readRows(rows: number) {
    const gl = this.gl;
    const w = this.width;
    const buf = new Uint8Array(w * rows * 4);
    // The top `rows` rows of the tile, then flip to top-down.
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
    this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.program, name));
    return this.loc.get(name)!;
  }

  private set1f(name: string, v: number) {
    this.gl.uniform1f(this.u(name), v);
  }

  private setParams(values: Values) {
    const gl = this.gl;
    for (const [k, p] of Object.entries(this.piece.params)) {
      const v = values[k];
      switch (p.kind) {
        case 'number':
        case 'int':
          this.set1f(`u_${k}`, Number(v));
          break;
        case 'bool':
          this.set1f(`u_${k}`, v ? 1 : 0);
          break;
        case 'choice':
          this.set1f(`u_${k}`, Math.max(0, p.options.indexOf(v as string)));
          break;
        case 'color':
          gl.uniform3fv(this.u(`u_${k}`), hexToRgb(String(v)));
          break;
        case 'palette': {
          const pal = getPalette(String(v));
          const cols = Array.from({ length: 8 }, (_, i) => hexToRgb(pal.colors[i % pal.colors.length])).flat();
          gl.uniform3fv(this.u(`u_${k}[0]`), cols);
          this.set1f(`u_${k}_n`, Math.min(8, pal.colors.length));
          gl.uniform3fv(this.u(`u_${k}_bg`), hexToRgb(pal.bg));
          gl.uniform3fv(this.u(`u_${k}_ink`), hexToRgb(pal.ink));
          break;
        }
      }
    }
  }

  private compile(): WebGLProgram {
    const gl = this.gl;
    const head = `${PRELUDE}\n${paramUniforms(this.piece.params)}\n#line 1\n`;
    const shader = (type: number, src: string, label: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`${label} shader error in "${this.piece.id}":\n${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    // `#line 1` makes error line numbers match the piece's own .frag file.
    const vs = shader(gl.VERTEX_SHADER, FULLSCREEN_VS, 'Vertex');
    const fs = shader(gl.FRAGMENT_SHADER, `${head}${this.piece.fragment}\n${MAIN}`, 'Fragment');
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link error in "${this.piece.id}":\n${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }
}
