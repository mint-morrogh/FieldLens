import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import admin1Url from '../../assets/admin1.topo.json?url';
import type { RegionLookup } from './areas';

/**
 * Offline point-in-province/state lookup against coarse Natural Earth admin-1 outlines
 * (public domain; built by scripts/build-admin1.mjs). The outlines (~1 MB, ~300 kB
 * gzipped) are a separate static file fetched only when the explored-areas card asks for
 * them, then kept for the session.
 *
 * As with countries, a location label is the centre of an ~11 km cell, so a find on the
 * coast can fall just offshore; we then look a little further out (up to ~35 km).
 */

type RegionProps = { name: string; c: string };
export type AdminTopology = Topology<{ regions: GeometryCollection<RegionProps> }>;

type Shape = {
  id: string;
  name: string;
  country: string;
  /** [west, south, east, north] */
  box: [number, number, number, number];
  rings: GeoJSON.Position[][];
};

const RINGS = [0.05, 0.1, 0.2, 0.35];
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function shapesOf(topology: AdminTopology): Shape[] {
  const fc = feature(topology, topology.objects.regions) as GeoJSON.FeatureCollection<
    GeoJSON.Geometry,
    RegionProps
  >;
  const shapes: Shape[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const rings =
      g?.type === 'Polygon'
        ? g.coordinates
        : g?.type === 'MultiPolygon'
          ? g.coordinates.flat()
          : [];
    if (!rings.length) continue;
    const box: Shape['box'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings)
      for (const [x, y] of ring) {
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      }
    shapes.push({
      id: String(f.id ?? f.properties.name),
      name: f.properties.name,
      country: f.properties.c,
      box,
      rings,
    });
  }
  return shapes;
}

/**
 * Even-odd test over every ring (outer rings and holes alike), in plain longitude/latitude:
 * the outlines were simplified that way, and long straight borders such as the 49th
 * parallel stay straight rather than bowing along great circles.
 */
function inside(shape: Shape, x: number, y: number): boolean {
  const [w, s, e, n] = shape.box;
  if (x < w || x > e || y < s || y > n) return false;
  let hit = false;
  for (const ring of shape.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** A cached lookup over already-loaded outlines (used directly by tests). */
export function createRegionLookup(topology: AdminTopology): RegionLookup {
  const shapes = shapesOf(topology);
  const reach = RINGS[RINGS.length - 1];
  const cache = new Map<string, ReturnType<RegionLookup> | null>();
  return (latitude, longitude) => {
    const key = `${latitude},${longitude}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit ?? undefined;
    // Only outlines within reach of the point can match, even further out.
    const near = shapes.filter(
      ({ box: [w, s, e, n] }) =>
        longitude >= w - reach &&
        longitude <= e + reach &&
        latitude >= s - reach &&
        latitude <= n + reach,
    );
    const containing = (lng: number, lat: number) => near.find((s) => inside(s, lng, lat));
    let found = containing(longitude, latitude);
    for (const r of RINGS) {
      if (found) break;
      for (const [dx, dy] of DIRECTIONS) {
        found = containing(longitude + dx * r, latitude + dy * r);
        if (found) break;
      }
    }
    const result = found ? { id: found.id, name: found.name, country: found.country } : null;
    cache.set(key, result);
    return result ?? undefined;
  };
}

let loading: Promise<RegionLookup> | undefined;

/**
 * Downloads the outlines once and resolves to the lookup. Rejects when offline or the
 * download fails; the next call tries again.
 */
export function loadRegionOf(): Promise<RegionLookup> {
  loading ??= fetch(admin1Url)
    .then((res) => {
      if (!res.ok) throw new Error(`Region outlines: HTTP ${res.status}`);
      return res.json() as Promise<AdminTopology>;
    })
    .then(createRegionLookup)
    .catch((err: unknown) => {
      loading = undefined;
      throw err;
    });
  return loading;
}
