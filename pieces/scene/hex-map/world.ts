// Real borders, and point → area lookups for sampling them onto a grid:
//  - countries: Natural Earth 1:50m via world-atlas (public domain);
//  - the 13 regions of metropolitan France: Admin Express (IGN) via
//    github.com/gregoiredavid/france-geojson, Licence Ouverte (Etalab),
//    simplified, coordinates rounded to 0.001°.
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-50m.json';
import france from './france-regions.json';

type Ring = [number, number][];
type Geometry = { type: string; coordinates: unknown } | null;
interface Area {
  name: string;
  /** All rings (outer and holes); even-odd filling handles both. */
  rings: Ring[];
  box: [number, number, number, number]; // lon min, lat min, lon max, lat max
}

function areas(features: { geometry: Geometry; properties?: { name?: string } | null }[]): Area[] {
  return features.flatMap((f) => {
    const g = f.geometry;
    if (!g) return [];
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][];
    // Rings that cross the antimeridian jump from +180 to −180; unwrap them so
    // each is continuous (longitudes may run past ±180) — lookups try lon ± 360.
    const rings = polys.flat().map((ring) => {
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
    const box: Area['box'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings)
      for (const [lon, lat] of ring) {
        box[0] = Math.min(box[0], lon);
        box[1] = Math.min(box[1], lat);
        box[2] = Math.max(box[2], lon);
        box[3] = Math.max(box[3], lat);
      }
    return [{ name: f.properties?.name ?? '', rings, box }];
  });
}

function lookup(all: Area[], lon: number, lat: number): number {
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

let countries: Area[] | null = null;
let regions: Area[] | null = null;

/** Index of the country containing (lon, lat), or −1 for sea. */
export function countryAt(lon: number, lat: number): number {
  if (!countries) {
    const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    countries = areas(feature(topo, topo.objects.countries).features as never).filter((c) => c.name !== 'Antarctica');
  }
  return lookup(countries, lon, lat);
}

/** Index of the French region (metropolitan) containing (lon, lat), or −1. */
export function frenchRegionAt(lon: number, lat: number): number {
  regions ??= areas(france.features as never);
  return lookup(regions, lon, lat);
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
  /** Metropolitan France: its regions flip, neighbours rest in grey. */
  france: [-5.6, 10, 41.2, 51.3],
} as const satisfies Record<string, readonly [number, number, number, number]>;
