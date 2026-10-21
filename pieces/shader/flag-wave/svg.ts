// A small SVG rasterizer for Canvas 2D that works in a worker (no DOM, no
// async image decoding). It covers what flag artwork uses: shapes and paths,
// groups, transforms, <use>, clip paths, fill/stroke styling and the plain
// stops of gradients (drawn as their middle colour).

type Ctx = OffscreenCanvasRenderingContext2D;

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}

export function parseSvg(src: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<[?!][^>]*>|<(\/?)([\w:-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  for (const m of src.matchAll(tagRe)) {
    if (!m[2]) continue;
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node: Node = { tag: m[2], attrs: parseAttrs(m[3]), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  const svg = root.children.find((n) => n.tag === 'svg');
  if (!svg) throw new Error('No <svg> element');
  return svg;
}

function parseAttrs(s: string) {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] ?? m[3];
  // Inline style wins over presentation attributes.
  for (const decl of (out.style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const nums = (s = '') => (s.match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** Applies an SVG transform list to the context. */
function applyTransform(ctx: Ctx, s?: string) {
  if (!s) return;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(args);
    switch (fn) {
      case 'matrix':
        ctx.transform(a[0], a[1], a[2], a[3], a[4], a[5]);
        break;
      case 'translate':
        ctx.translate(a[0], a[1] ?? 0);
        break;
      case 'scale':
        ctx.scale(a[0], a[1] ?? a[0]);
        break;
      case 'rotate':
        ctx.translate(a[1] ?? 0, a[2] ?? 0);
        ctx.rotate((a[0] * Math.PI) / 180);
        ctx.translate(-(a[1] ?? 0), -(a[2] ?? 0));
        break;
      case 'skewX':
        ctx.transform(1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0);
        break;
      case 'skewY':
        ctx.transform(1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0);
        break;
    }
  }
}

function shapePath(n: Node): Path2D | undefined {
  const a = n.attrs;
  const f = (k: string, d = 0) => (a[k] === undefined ? d : parseFloat(a[k]));
  const p = new Path2D();
  switch (n.tag) {
    case 'path':
      return a.d ? new Path2D(a.d) : undefined;
    case 'rect': {
      const [x, y, w, h] = [f('x'), f('y'), f('width'), f('height')];
      const rx = Math.min(f('rx', f('ry')), w / 2);
      const ry = Math.min(f('ry', f('rx')), h / 2);
      if (rx > 0 || ry > 0) p.roundRect(x, y, w, h, Math.max(rx, ry));
      else p.rect(x, y, w, h);
      return p;
    }
    case 'circle':
      p.arc(f('cx'), f('cy'), f('r'), 0, Math.PI * 2);
      return p;
    case 'ellipse':
      p.ellipse(f('cx'), f('cy'), f('rx'), f('ry'), 0, 0, Math.PI * 2);
      return p;
    case 'line':
      p.moveTo(f('x1'), f('y1'));
      p.lineTo(f('x2'), f('y2'));
      return p;
    case 'polygon':
    case 'polyline': {
      const v = nums(a.points);
      for (let i = 0; i + 1 < v.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, v[i], v[i + 1]);
      if (n.tag === 'polygon') p.closePath();
      return p;
    }
  }
}

const INHERITED = [
  'fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke-opacity',
  'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'color',
] as const;
type Style = Partial<Record<(typeof INHERITED)[number], string>>;

export function drawSvg(ctx: Ctx, src: string | Node, x: number, y: number, w: number, h: number) {
  const svg = typeof src === 'string' ? parseSvg(src) : src;
  const ids = new Map<string, Node>();
  const index = (n: Node) => {
    if (n.attrs.id) ids.set(n.attrs.id, n);
    n.children.forEach(index);
  };
  index(svg);
  const ref = (s?: string) => ids.get((s ?? '').replace(/^url\(\s*#?|\)$|^#/g, ''));

  const paint = (v: string | undefined, style: Style): string | undefined => {
    if (!v || v === 'none') return undefined;
    if (v === 'currentColor') return style.color ?? '#000';
    const grad = v.startsWith('url(') ? ref(v) : undefined;
    if (v.startsWith('url(')) {
      const stops = grad?.children.filter((c) => c.tag === 'stop') ?? [];
      const stop = stops[Math.floor(stops.length / 2)];
      return stop ? (stop.attrs['stop-color'] ?? '#000') : undefined;
    }
    return v;
  };

  const clipTo = (clip: Node) => {
    const p = new Path2D();
    for (const c of clip.children) {
      const s = shapePath(c);
      if (s) p.addPath(s);
    }
    ctx.clip(p);
  };

  const draw = (n: Node, inherited: Style) => {
    const a = n.attrs;
    if (n.tag === 'defs' || n.tag === 'clipPath' || n.tag === 'mask' || n.tag.endsWith('Gradient')) return;
    if (a.display === 'none' || a.visibility === 'hidden') return;
    const style: Style = { ...inherited };
    for (const k of INHERITED) if (a[k] !== undefined && a[k] !== 'inherit') style[k] = a[k];

    ctx.save();
    applyTransform(ctx, a.transform);
    const clip = a['clip-path'] && ref(a['clip-path']);
    if (clip) clipTo(clip);
    if (a.opacity) ctx.globalAlpha *= parseFloat(a.opacity);

    if (n.tag === 'g' || n.tag === 'svg') {
      for (const c of n.children) draw(c, style);
    } else if (n.tag === 'use') {
      const target = ref(a.href ?? a['xlink:href']);
      ctx.translate(parseFloat(a.x ?? '0'), parseFloat(a.y ?? '0'));
      if (target) draw(target, style);
    } else {
      const path = shapePath(n);
      if (path) {
        const fill = paint(style.fill ?? '#000', style);
        if (fill && n.tag !== 'line' && n.tag !== 'polyline') {
          ctx.fillStyle = fill;
          const alpha = ctx.globalAlpha;
          ctx.globalAlpha *= parseFloat(style['fill-opacity'] ?? '1');
          ctx.fill(path, style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero');
          ctx.globalAlpha = alpha;
        }
        const stroke = paint(style.stroke, style);
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = parseFloat(style['stroke-width'] ?? '1');
          ctx.lineJoin = (style['stroke-linejoin'] as CanvasLineJoin) ?? 'miter';
          ctx.lineCap = (style['stroke-linecap'] as CanvasLineCap) ?? 'butt';
          ctx.miterLimit = parseFloat(style['stroke-miterlimit'] ?? '4');
          ctx.globalAlpha *= parseFloat(style['stroke-opacity'] ?? '1');
          ctx.stroke(path);
        }
      }
    }
    ctx.restore();
  };

  const [vx, vy, vw, vh] = svg.attrs.viewBox
    ? nums(svg.attrs.viewBox)
    : [0, 0, parseFloat(svg.attrs.width ?? `${w}`), parseFloat(svg.attrs.height ?? `${h}`)];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / vw, h / vh);
  ctx.translate(-vx, -vy);
  for (const c of svg.children) draw(c, {});
  ctx.restore();
}
