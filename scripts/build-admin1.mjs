// Builds src/assets/admin1.topo.json: coarse first-level admin regions (provinces, states,
// regions) for the journal's offline "provinces & states" milestones.
//
// Source: Natural Earth 1:10m "Admin 1 – States, Provinces" (public domain,
// https://www.naturalearthdata.com/about/terms-of-use/), GeoJSON from
// https://github.com/nvkelso/natural-earth-vector (geojson/ne_10m_admin_1_states_provinces.geojson).
//
// Usage: node scripts/build-admin1.mjs [path/to/ne_10m_admin_1_states_provinces.geojson]
// (downloads the GeoJSON, ~40 MB, when no local copy is given). Simplifies with mapshaper
// (run through npx, no dependency added):
//   mapshaper <prepared.geojson> -dissolve id copy-fields=name,c \
//     -simplify dp interval=4000 keep-shapes -clean \
//     -o format=topojson quantization=50000 src/assets/admin1.topo.json
//
// Where Natural Earth's admin-1 units are very fine (UK counties, French departments,
// Italian and Spanish provinces, Slovenian and Latvian municipalities, Maltese councils),
// they are merged into the level people think of as the province or state: the UK's four
// nations, and the region field elsewhere.
//
// Each feature keeps its id and { name, c } (English name, ISO 3166-1 alpha-2 country).
// Units with no name (unassigned areas) take the country's name.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const OUT = new URL('../src/assets/admin1.topo.json', import.meta.url).pathname;
// Douglas-Peucker to a fixed ~4 km tolerance everywhere: a percentage would spend the vertex
// budget on the Arctic and Norwegian coasts and leave states like New York with a few dozen
// points, and Visvalingam at this tolerance drops narrow islands such as Manhattan.
const SIMPLIFY = 'interval=4000';

/** Country (adm0_a3) → how to merge its admin-1 units, by a property name. */
const MERGE = {
  GBR: 'geonunit',
  FRA: 'region',
  ITA: 'region',
  ESP: 'region',
  SVN: 'region',
  LVA: 'region',
  MLT: 'region',
};

const text = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : await (await fetch(SOURCE)).text();
const source = JSON.parse(text);

const features = source.features
  .filter((f) => f.geometry)
  .map((f) => {
    const p = f.properties;
    const by = MERGE[p.adm0_a3];
    const group = by && p[by];
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: group
        ? { id: `${p.adm0_a3}-${group}`, name: group, c: p.iso_a2 }
        : { id: p.adm1_code, name: p.name_en || p.name || p.admin, c: p.iso_a2 },
    };
  });

const dir = mkdtempSync(join(tmpdir(), 'admin1-'));
const prepared = join(dir, 'prepared.geojson');
writeFileSync(prepared, JSON.stringify({ type: 'FeatureCollection', features }));
execFileSync(
  'npx',
  [
    '-y',
    'mapshaper@0.7',
    prepared,
    '-dissolve',
    'id',
    'copy-fields=name,c',
    '-simplify',
    'dp',
    SIMPLIFY,
    'keep-shapes',
    '-clean',
    '-rename-layers',
    'regions',
    '-o',
    'format=topojson',
    'quantization=50000',
    'id-field=id',
    OUT,
  ],
  { stdio: 'inherit' },
);
// The id is kept on each geometry; drop the copy mapshaper leaves in its properties.
const topology = JSON.parse(readFileSync(OUT, 'utf8'));
for (const g of topology.objects.regions.geometries) delete g.properties.id;
writeFileSync(OUT, JSON.stringify(topology));
console.log(`${features.length} source units → ${OUT} (${statSync(OUT).size} bytes)`);
