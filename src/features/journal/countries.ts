import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { CountryLookup } from './areas';

/**
 * Offline point-in-country lookup using the same world-atlas outlines as the globe (no
 * network). Loaded on demand so the outlines only download with the journal.
 *
 * The outlines are coarse (1:110m), and a location label is the centre of an ~11 km
 * cell, so a find on the coast can fall just offshore. We then look a little further out
 * (up to ~50 km) and take the first country found.
 */

type CountryFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id?: string };

const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (
  feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Geometry,
    { name: string }
  >
).features as CountryFeature[];

const RINGS = [0.1, 0.25, 0.45];
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

function containing(lng: number, lat: number) {
  return COUNTRIES.find((c) => geoContains(c, [lng, lat]));
}

const cache = new Map<string, { id: string; name: string } | null>();

export const countryOf: CountryLookup = (latitude, longitude) => {
  const key = `${latitude},${longitude}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ?? undefined;
  let found = containing(longitude, latitude);
  for (const r of RINGS) {
    if (found) break;
    for (const [dx, dy] of DIRECTIONS) {
      found = containing(longitude + dx * r, latitude + dy * r);
      if (found) break;
    }
  }
  const result = found
    ? { id: String(found.id ?? found.properties.name), name: found.properties.name }
    : null;
  cache.set(key, result);
  return result ?? undefined;
};
