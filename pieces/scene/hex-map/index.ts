import { bool, choice, color, getPalette, group, int, mix, adjust, num, palette, smoothstep, type Vec2 } from '../../../engine2d';
import { defineScene, inFrame, type Material, type SceneCamera, type SurfaceTexture } from '../../../enginegl';
import { geodesic, toLocal, type Vec3 } from './globe';
import { countryAt, REGIONS } from './world';

// Hexagons laid out as a map — a flat floor, or a globe (a geodesic sphere of
// hexagons and 12 pentagons) — with real countries (Natural Earth borders
// sampled onto the cells) or invented ones. Every country has a colour on
// each face (two map colourings, neighbours always told apart), and the map
// beats like a heart: each beat sends a pulse out from the heart, and as it
// reaches a country the whole country flips over — a quick, strong lub — then
// trembles with a softer dub; the sea turns tile by tile like a swell. The next
// beat flips everything back. An even number of beats per loop brings every
// tile home, so the loop is seamless.

const EDGES: Record<string, Omit<Material, 'color'> & { color?: string }> = {
  brass: { color: '#c9a15a', roughness: 0.3, metal: 1, texture: 'brushed', textureStrength: 0.6 },
  steel: { color: '#c3c8cf', roughness: 0.25, metal: 1, texture: 'brushed', textureStrength: 0.6 },
  matte: { roughness: 0.7, metal: 0 },
};
const FACE_ROUGHNESS: Record<SurfaceTexture, number> = { marble: 0.25, ceramic: 0.16, brushed: 0.38, plain: 0.5, matte: 0.85 };

const SQRT3 = Math.sqrt(3);

// Pointy-top hexagon with unit circumradius; axial neighbours.
const HEX: Vec2[] = Array.from({ length: 6 }, (_, k) => [Math.cos(Math.PI / 6 + (k * Math.PI) / 3), Math.sin(Math.PI / 6 + (k * Math.PI) / 3)]);
// Pentagon with the hexagon's apothem (√3/2), for the globe's 12 five-sided cells.
const PENT: Vec2[] = Array.from({ length: 5 }, (_, k) => {
  const r = SQRT3 / 2 / Math.cos(Math.PI / 5);
  const a = Math.PI / 5 + (k * 2 * Math.PI) / 5;
  return [r * Math.cos(a), r * Math.sin(a)];
});
const AXIAL: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

interface Tile {
  /** Delay into each beat (in beats) before this tile flips. */
  delay: number;
  axis: number;
  reach: number;
  /** Size of the cell (globe cells vary a little). */
  scale: number;
}

export default defineScene({
  id: 'hex-map',
  title: 'Hex Map',
  tags: ['3d', 'tiling', 'loop', 'heartbeat', 'map'],
  aspect: 16 / 9,
  animation: { duration: 16, fps: 30, loop: true, durationParam: 'duration' },
  params: {
    ...group('Map', {
      view: choice(['flat', 'globe'], 'flat'),
      region: choice([...(Object.keys(REGIONS) as (keyof typeof REGIONS)[]), 'invented'], 'world'),
      detail: int(90, 20, 220, 'Hexes across'),
      countries: int(16, 2, 60, 'Countries (invented)'),
      roughness: num(1.4, 0, 4, 0.05, 'Border roughness (invented)'),
      variety: num(0.45, 0, 1, 0.01, 'Size variety (invented)'),
      day: palette('atlas', 'Front palette'),
      night: palette('dusk', 'Back palette'),
      sea: color('#a7c6d6', 'Sea'),
      seaFlips: bool(false, 'Sea flips'),
      seaBack: color('#1b2a3a', 'Sea (back)'),
    }),
    ...group('Heartbeat', {
      duration: num(16, 4, 60, 0.5, 'Loop length (s)'),
      beats: int(4, 2, 16, 'Beats per loop'),
      origin: choice(['center', 'random', 'edge'], 'center', 'Heart'),
      spread: num(0.55, 0, 0.95, 0.01, 'Pulse travel'),
      ripple: num(0.12, 0, 0.5, 0.01, 'Ripple in country'),
      flip: num(0.32, 0.1, 0.6, 0.01, 'Flip length'),
      dub: num(0.5, 0, 1, 0.01, 'Dub'),
      lift: num(0.35, 0, 2, 0.05),
    }),
    ...group('Signal', {
      glow: bool(true, 'Glow'),
      signal: num(0.22, 0, 3, 0.05, 'Strength'),
      signalColor: color('#ff5a4f', 'Color'),
      bloom: num(0.35, 0, 2, 0.05),
    }),
    ...group('Camera', {
      tilt: num(0, 0, 80, 1, 'Tilt'),
      globeLat: num(22, 0, 80, 1, 'Globe latitude'),
      spin: num(1.5, 0, 30, 0.1, 'Globe spin (°/s, world only)'),
      turn: num(-90, -180, 180, 1, 'Turn'),
      fov: num(30, 10, 70, 1, 'Lens (fov)'),
      zoom: num(1, 0.3, 10, 0.01),
      drift: bool(false, 'Drift'),
      sway: num(0.08, 0, 0.6, 0.01, 'Drift amount'),
      dof: num(0, 0, 1, 0.01, 'Depth of field'),
    }),
    ...group('Look', {
      texture: choice(['matte', 'ceramic', 'marble', 'brushed', 'plain'], 'matte'),
      edge: choice(['brass', 'steel', 'matte'], 'matte'),
      thickness: num(0.16, 0.03, 0.4, 0.005),
      bevel: num(0.5, 0, 1, 0.01),
      grout: num(0.05, 0, 0.2, 0.005),
    }),
    ...group('Light & finish', {
      sunHeight: num(42, 8, 85, 1, 'Sun height'),
      sunAngle: num(215, 0, 360, 1, 'Sun angle'),
      softness: num(0.5, 0, 1, 0.01, 'Shadow softness'),
      fog: num(0, 0, 1, 0.01),
      exposure: num(1, 0.3, 3, 0.05),
      grain: num(0.02, 0, 0.1, 0.005),
    }),
  },

  build({ p, noise, rng }) {
    const day = getPalette(p.day);
    const night = getPalette(p.night);
    const globe = p.view === 'globe';

    // Cells: where each tile sits, which way it faces, its in-plane angle, shape
    // (0 hexagon, 1 pentagon), size, and neighbours.
    let pos: Vec3[], normal: Vec3[], angle: number[], shape: number[], scale: number[], adj: number[][];
    let camera: SceneCamera;
    let lonLat: (i: number) => [number, number] | null; // real-map coordinates, null = off the map
    let inView: boolean[];

    let facing: Vec3 = [0, 0, 1]; // direction from the globe's centre to the camera at the start
    if (globe) {
      // A geodesic globe, sized so its hexagons match the flat map's: `detail`
      // cells across the frame — across the whole globe, or across the region.
      const region = p.region === 'world' || p.region === 'invented' ? null : REGIONS[p.region];
      const rad = Math.PI / 180;
      const across = region
        ? Math.max((region[1] - region[0]) * rad * Math.cos(((region[2] + region[3]) / 2) * rad), ((region[3] - region[2]) * rad * 16) / 9)
        : Math.PI;
      const g = geodesic(Math.max(4, Math.min(120, Math.round((1.1 * p.detail) / across))));
      const spacing = g.centers.map((c, i) => g.neighbors[i].reduce((sum, j) => sum + Math.hypot(...([0, 1, 2].map((k) => g.centers[j][k] - c[k]) as Vec3)), 0) / g.neighbors[i].length);
      const R = SQRT3 / (spacing.reduce((a, b) => a + b, 0) / spacing.length);
      let geo = g.centers; // true positions: north pole +z, longitude 0 along +x
      lonLat = (i) => [(Math.atan2(geo[i][1], geo[i][0]) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, geo[i][2]))) * 180) / Math.PI];

      // A region turns to face the camera and holds still, north up; the whole
      // world can spin, very slowly.
      const viewLat = Math.max(0.5, p.globeLat);
      const lonC = region ? (region[0] + region[1]) / 2 : p.turn;
      const latC = region ? (region[2] + region[3]) / 2 : viewLat;
      // Tip the globe about the east–west axis at the region's longitude, bringing
      // the region's latitude up to where the camera looks from.
      const east: Vec3 = [-Math.sin(lonC * rad), Math.cos(lonC * rad), 0];
      const tip = (v: Vec3, a: number): Vec3 => {
        const c = Math.cos(a), sn = Math.sin(a), dot = east[0] * v[0] + east[1] * v[1];
        const cross: Vec3 = [east[1] * v[2], -east[0] * v[2], east[0] * v[1] - east[1] * v[0]];
        return [0, 1, 2].map((k) => v[k] * c + cross[k] * sn + east[k] * dot * (1 - c)) as Vec3;
      };
      const unit = (lon: number, lat: number): Vec3 => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
      facing = unit(lonC, viewLat);
      const a = [1, -1].map((sg) => (sg * (viewLat - latC) * rad)).find((t) => Math.hypot(...tip(unit(lonC, latC), t).map((v, k) => v - facing[k])) < 1e-6) ?? 0;
      normal = geo.map((c) => tip(c, a));
      pos = normal.map((c) => c.map((v) => v * R) as Vec3);
      shape = g.neighbors.map((n) => (n.length === 5 ? 1 : 0));
      scale = spacing.map((d) => (d * R) / SQRT3);
      adj = g.neighbors;
      // Line an edge of each cell up with its first neighbour, so the cells mesh.
      angle = normal.map((c, i) => {
        const d = toLocal(c, [0, 1, 2].map((k) => normal[g.neighbors[i][0]][k] - c[k]) as Vec3);
        return Math.atan2(d[1], d[0]);
      });

      const spin = region ? 0 : (p.spin * p.duration) / 360; // turns per loop
      const tilt = 90 - viewLat;
      if (region) {
        // Look at the region's surface and frame it, so zooming in never puts the
        // camera inside the globe.
        const half = Math.max(R * Math.sin(((region[3] - region[2]) / 2) * rad), (R * Math.cos(latC * rad) * Math.sin(Math.min(90, (region[1] - region[0]) / 2) * rad) * 9) / 16);
        camera = { tilt, turn: lonC, projection: 'perspective', fov: p.fov, zoom: (half * 1.1) / p.zoom, target: facing.map((v) => v * R) as Vec3, dof: p.dof, fog: p.fog };
        // Keep only the cells facing the camera and in frame; the rest of this
        // finer globe would never be seen.
        const seen = inFrame(camera, 16 / 9, 1.25);
        const keep = pos.map((q, i) => i).filter((i) => normal[i].reduce((sum, v, k) => sum + v * facing[k], 0) > 0 && seen(...pos[i]));
        const remap = new Map(keep.map((i, j) => [i, j]));
        geo = keep.map((i) => geo[i]);
        const pick = <T,>(arr: T[]) => keep.map((i) => arr[i]);
        [normal, pos, shape, scale, angle] = [pick(normal), pick(pos), pick(shape), pick(scale), pick(angle)];
        adj = keep.map((i) => adj[i].filter((j) => remap.has(j)).map((j) => remap.get(j)!));
        inView = pos.map(() => true);
      } else {
        // The whole globe, turning about its centre; never closer than its surface.
        const zoom = Math.max((R * 1.25) / p.zoom, R * 1.15 * Math.tan((p.fov * rad) / 2));
        camera = { tilt, turn: lonC, projection: 'perspective', fov: p.fov, zoom, orbit: spin, dof: p.dof, fog: p.fog };
        inView = pos.map(() => true);
      }
    } else {
      // `detail` hexagons across the frame (unit circumradius → √3 wide each).
      const zoom = (p.detail * SQRT3 * 9) / 32 / p.zoom;
      camera = { tilt: p.tilt, turn: p.turn, projection: 'perspective', fov: p.fov, zoom, sway: p.drift ? p.sway : 0, dof: p.dof, fog: p.fog };
      // A rectangle of hexagons a little larger than the frame (more when tilted).
      const hx = zoom * (16 / 9) * 1.15 * (1 + p.tilt / 45);
      const hy = zoom * 1.15 * (1 + p.tilt / 25);
      const index = new Map<string, number>();
      const flat: Vec2[] = [];
      const rows = Math.ceil(hy / 1.5) + 1;
      for (let r = -rows; r <= rows; r++) {
        const cols = Math.ceil(hx / SQRT3) + 1;
        for (let col = -cols; col <= cols; col++) {
          const q = col - Math.floor(r / 2);
          index.set(`${q},${r}`, flat.length);
          flat.push([SQRT3 * (q + r / 2), 1.5 * r]);
        }
      }
      const axial = [...index.keys()].map((k) => k.split(',').map(Number));
      adj = axial.map(([q, r]) => AXIAL.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`)).filter((j): j is number => j !== undefined));
      pos = flat.map(([x, y]) => [x, y, 0]);
      normal = flat.map(() => [0, 0, 1]);
      angle = flat.map(() => 0);
      shape = flat.map(() => 0);
      scale = flat.map(() => 1);
      const seen = inFrame(camera, 16 / 9, 1.25);
      inView = flat.map(([x, y]) => seen(x, y));
      // Fit the region into the frame.
      const [lon0, lon1, lat0, lat1] = REGIONS[p.region === 'invented' ? 'world' : p.region];
      const lonC = (lon0 + lon1) / 2, latC = (lat0 + lat1) / 2;
      const squash = Math.cos((latC * Math.PI) / 180);
      const k = Math.min((2 * zoom * 16) / 9 / ((lon1 - lon0) * squash), (2 * zoom) / (lat1 - lat0));
      lonLat = (i) => {
        const lon = lonC + flat[i][0] / (k * squash), lat = latC + flat[i][1] / k;
        return Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
      };
    }
    const n = pos.length;
    const visible = [...pos.keys()].filter((i) => inView[i]);
    const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // country[i]: which country tile i belongs to (−1 = sea).
    const country = new Int32Array(n).fill(-1);
    let count = 0;
    if (p.region !== 'invented') {
      // Real borders: look up each cell's longitude / latitude.
      const ids = new Map<number, number>();
      for (let i = 0; i < n; i++) {
        const ll = lonLat(i);
        const c = ll ? countryAt(ll[0], ll[1]) : -1;
        if (c < 0) continue;
        if (!ids.has(c)) ids.set(c, ids.size);
        country[i] = ids.get(c)!;
      }
      count = ids.size;
    } else {
      // Invented countries: capitals scattered over the frame (best-candidate
      // sampling keeps them apart without a grid look), then grown outward over a
      // noisy cost field so borders wander like real ones, each at its own rate.
      const capitals: number[] = [];
      for (let c = 0; c < Math.min(p.countries, visible.length); c++) {
        let best = visible[rng.int(0, visible.length)], bestD = -1;
        for (let k = 0; k < (c ? 8 : 1); k++) {
          const cand = visible[rng.int(0, visible.length)];
          const d = Math.min(...capitals.map((o) => dist(pos[o], pos[cand])));
          if (d > bestD) [best, bestD] = [cand, d];
        }
        capitals.push(best);
      }
      const speed = capitals.map(() => 1 + p.variety * rng.range(-0.5, 0.6));
      const cost = new Float64Array(n).fill(Infinity);
      const heap = new MinHeap();
      capitals.forEach((i, c) => ((cost[i] = 0), (country[i] = c), heap.push(0, i)));
      while (heap.size) {
        const [d, i] = heap.pop();
        if (d > cost[i]) continue;
        for (const j of adj[i]) {
          const [x, y, z] = pos[j];
          const step = (1 + p.roughness * (0.5 + 0.5 * noise.fbm2(x * 0.11 + z * 0.07, y * 0.11 - z * 0.05, 3)) + 0.3 * rng()) / speed[country[i]];
          if (d + step < cost[j]) {
            cost[j] = d + step;
            country[j] = country[i];
            heap.push(cost[j], j);
          }
        }
      }
      count = capitals.length;
    }

    // Two map colourings, neighbours always different where the palette allows.
    const borders = Array.from({ length: count }, () => new Set<number>());
    adj.forEach((ns, i) => ns.forEach((j) => country[i] >= 0 && country[j] >= 0 && country[i] !== country[j] && borders[country[i]].add(country[j])));
    const colour = (colours: number) => {
      const pick = new Int32Array(count).fill(-1);
      const used = new Array(colours).fill(0);
      const order = rng.shuffle([...borders.keys()]).sort((a, b) => borders[b].size - borders[a].size);
      for (const c of order) {
        const taken = new Set([...borders[c]].map((o) => pick[o]));
        const free = [...used.keys()].filter((k) => !taken.has(k));
        const pool = free.length ? free : [...used.keys()];
        const k = pool.reduce((a, b) => (used[b] < used[a] ? b : a), pool[0]);
        pick[c] = k;
        used[k]++;
      }
      return pick;
    };
    const front = colour(Math.min(6, day.colors.length));
    const back = colour(Math.min(6, night.colors.length));

    // Each country's middle (over its tiles in frame, else all its tiles).
    const middle = Array.from({ length: count }, (_, c): Vec3 => {
      const sum: Vec3 = [0, 0, 0];
      let m = 0;
      for (const all of [false, true]) {
        country.forEach((cc, i) => cc === c && (all || inView[i]) && (sum.forEach((_, k) => (sum[k] += pos[i][k])), m++));
        if (m) break;
      }
      return sum.map((v) => v / m) as Vec3;
    });
    // The heart, and when the pulse reaches each country (in beats). Countries
    // flip as one; the sea turns tile by tile, like a swell rolling outward.
    const land = visible.filter((i) => country[i] >= 0);
    let heart: Vec3;
    if (p.origin === 'random' && land.length) heart = middle[country[land[rng.int(0, land.length)]]];
    else if (globe) {
      // The point facing the camera when the loop starts.
      const r = Math.hypot(...pos[0]);
      heart = facing.map((v) => v * r) as Vec3;
    } else if (p.origin === 'edge') heart = pos[visible.reduce((a, b) => (pos[b][0] < pos[a][0] ? b : a), visible[0])];
    else heart = [0, 0, 0];
    const far = Math.max(1e-6, ...visible.map((i) => dist(pos[i], heart)));
    // Each country's size, so the ripple inside it takes the same time whether
    // it is Luxembourg or Russia.
    const size = new Float64Array(count).fill(1e-6);
    country.forEach((c, i) => c >= 0 && inView[i] && (size[c] = Math.max(size[c], dist(pos[i], middle[c]))));
    // Keep every flip inside its beat: the pulse and ripple together end before
    // the next beat begins, so the loop opens on a still map.
    const squeeze = Math.min(1, Math.max(0, 1 - p.flip - 0.06) / Math.max(1e-6, p.spread + p.ripple));
    const outline = (i: number) => (shape[i] ? PENT : HEX).map(([x, y]): Vec2 => [x * scale[i], y * scale[i]]);
    const tiles = pos.map((c, i): Tile | null => {
      if (!inView[i] || (country[i] < 0 && !p.seaFlips)) return null;
      const m = country[i] >= 0 ? middle[country[i]] : c;
      // Tip away from the heart, about one of the tile's own mirror lines (every
      // 30° on a hexagon, 36° on a pentagon) so it lands back in its own slot.
      const away = toLocal(normal[i], [0, 1, 2].map((k) => m[k] - heart[k]) as Vec3);
      const want = Math.atan2(away[1], away[0]) + Math.PI / 2;
      const sym = shape[i] ? Math.PI / 5 : Math.PI / 6;
      const axis = angle[i] + Math.round((want - angle[i]) / sym) * sym;
      const perp: Vec2 = [-Math.sin(axis), Math.cos(axis)];
      const reach = Math.max(
        ...outline(i).map(([vx, vy]) => {
          const ca = Math.cos(angle[i]), sa = Math.sin(angle[i]);
          return Math.abs((vx * ca - vy * sa) * perp[0] + (vx * sa + vy * ca) * perp[1]);
        }),
      );
      const inside = country[i] >= 0 ? dist(c, m) / size[country[i]] : 0;
      const delay = squeeze * ((p.spread * dist(m, heart)) / far + p.ripple * inside);
      return { delay, axis, reach, scale: scale[i] };
    });

    const face = (c: string): Material => ({ color: c, roughness: FACE_ROUGHNESS[p.texture], metal: 0, texture: p.texture, textureScale: 1, textureStrength: 0.8 });
    const dayMats = day.colors.slice(0, 6).map(face);
    const nightMats = night.colors.slice(0, 6).map(face);
    const seaMat = dayMats.length + nightMats.length;
    const edge = EDGES[p.edge];
    const edgeMat = seaMat + 2;

    return {
      shapes: [HEX, PENT],
      thickness: p.thickness,
      bevel: (p.bevel * p.thickness) / 2,
      gap: 1 - p.grout,
      instances: pos.map(([x, y, z], i) => ({
        shape: shape[i],
        x,
        y,
        angle: angle[i],
        ...(globe ? { normal: normal[i], z } : {}),
        front: country[i] < 0 ? seaMat : front[country[i]],
        back: country[i] < 0 ? seaMat + 1 : dayMats.length + back[country[i]],
      })),
      materials: [
        ...dayMats,
        ...nightMats,
        face(p.sea),
        face(p.seaBack),
        { ...edge, color: edge.color ?? mix(adjust(day.bg, -0.25), night.bg, 0.5) },
        { color: mix(night.bg, '#000000', 0.35), roughness: 0.9, metal: 0 },
      ],
      edge: edgeMat,
      ground: globe ? null : edgeMat + 1,
      occlusion: !globe,
      camera,
      // On the globe the sun turns with the camera, so the side you see stays lit.
      light: { azimuth: globe ? p.sunAngle - 180 : p.sunAngle, elevation: p.sunHeight, color: '#fff2df', intensity: 3.2, softness: p.softness, follow: globe },
      environment: globe
        ? { sky: adjust(night.bg, 0.08), horizon: night.bg, ground: adjust(night.bg, -0.04) }
        : { sky: adjust(day.bg, 0.1, 0.8), horizon: day.bg, ground: adjust(night.bg, 0.05) },
      glow: { color: p.signalColor, intensity: 3 },
      post: { exposure: p.exposure, vignette: 0.35, grain: p.grain, bloom: p.glow ? p.bloom : 0 },
      data: { tiles, scale },
    };
  },

  animate({ p, phase }, scene, out) {
    const beats = 2 * Math.ceil(p.beats / 2); // even, so every tile ends face up
    const flip = p.flip;
    const dubAt = Math.min(0.92, flip + 0.1);
    scene.data.tiles.forEach((tile, i) => {
      if (!tile) {
        out.flip[i] = out.lift[i] = out.glow[i] = 0;
        out.scale[i] = scene.data.scale[i];
        return;
      }
      // Time in beats for this tile; each whole beat is one completed flip.
      const u = phase * beats - tile.delay;
      const k = Math.floor(u);
      const x = u - k;
      const t = Math.min(1, x / flip);
      // Lub: a quick, strong turn that eases into place.
      const turn = 1 - (1 - t) ** 3 * (1 + 3 * t);
      // Dub: a softer tremor just after, tipping a little and settling back.
      const dt = x - dubAt;
      const dub = p.dub * 0.35 * (dt < 0 ? Math.exp(-((dt / 0.025) ** 2)) : Math.exp(-dt / 0.07)) * Math.sin(Math.min(1, Math.max(0, (x - flip) / 0.05)) * (Math.PI / 2));
      const angle = Math.PI * (k + turn) + dub;
      const hop = t < 1 ? Math.sin(Math.PI * t) ** 1.2 * (1 + p.lift) : 0;
      out.flip[i] = angle;
      out.axis[i] = tile.axis;
      out.lift[i] = Math.max(hop, Math.abs(Math.sin(angle)) * 1.02) * tile.reach;
      out.scale[i] = 1;
      // A brief flush of the heart colour as the pulse passes through.
      out.glow[i] = p.glow ? p.signal * (1 - smoothstep(0, 1, x / (flip * 0.8))) * smoothstep(0, 0.04, x) : 0;
    });
  },
});

/** Binary min-heap of [priority, value]. */
class MinHeap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(priority: number, value: number) {
    const a = this.items;
    a.push([priority, value]);
    for (let i = a.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
