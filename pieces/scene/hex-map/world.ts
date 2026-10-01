// Real country borders (Natural Earth 1:50m via world-atlas, public domain),
// and a point → country lookup for sampling them onto a grid.
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-50m.json';

type Ring = [number, number][];
interface Country {
  name: string;
  /** All rings (outer and holes); even-odd filling handles both. */
  rings: Ring[];
  box: [number, number, number, number]; // lon min, lat min, lon max, lat max
}

let countries: Country[] | null = null;

function load(): Country[] {
  if (countries) return countries;
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries);
  countries = fc.features.flatMap((f) => {
    const g = f.geometry;
    if (!g) return [];
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (f.properties?.name === 'Antarctica') return [];
    // Rings that cross the antimeridian jump from +180 to −180; unwrap them so
    // each is continuous (longitudes may run past ±180) — lookups try lon ± 360.
    const rings = (polys.flat() as Ring[]).map((ring) => {
      let shift = 0;
      return ring.map(([lon, lat], i): [number, number] => {
        if (i > 0) {
          const prev = ring[i - 1][0];
          if (lon - prev > 180) shift -= 360;
          else if (prev - lon > 180) shift += 360;
        }
        return [lon + shift, lat];
      });
    });
    if (!rings.length) return [];
    const box: Country['box'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings)
      for (const [lon, lat] of ring) {
        box[0] = Math.min(box[0], lon);
        box[1] = Math.min(box[1], lat);
        box[2] = Math.max(box[2], lon);
        box[3] = Math.max(box[3], lat);
      }
    return [{ name: f.properties?.name ?? '', rings, box }];
  });
  return countries;
}

/** Index of the country containing (lon, lat), or −1 for sea. */
export function countryAt(lon: number, lat: number): number {
  const all = load();
  for (let c = 0; c < all.length; c++) {
    const { box, rings } = all[c];
    if (lat < box[1] || lat > box[3]) continue;
    for (const x of [lon, lon - 360, lon + 360]) {
      if (x < box[0] || x > box[2]) continue;
      let inside = false;
      for (const ring of rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
        }
      if (inside) return c;
    }
  }
  return -1;
}

/** Map regions as [lon min, lon max, lat min, lat max]. */
export const REGIONS = {
  world: [-180, 180, -58, 84],
  europe: [-25, 45, 34, 71],
  africa: [-20, 55, -36, 38],
  asia: [25, 150, -10, 60],
  'north-america': [-170, -50, 7, 75],
  'south-america': [-90, -30, -56, 13],
  'middle-east': [25, 65, 12, 42],
} as const satisfies Record<string, readonly [number, number, number, number]>;
