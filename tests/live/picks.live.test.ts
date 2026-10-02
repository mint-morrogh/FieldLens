// @vitest-environment node
/**
 * Opt-in check of the picker groups against our real BioCLIP Space, using openly licensed,
 * research-grade iNaturalist photos. Each photo goes through "Not sure" and through the pick
 * a person would choose. Uses the Space's daily GPU quota (~2 calls per case), so run it
 * only when the groups change:  LIVE_TESTS=1 npx vitest run tests/live/picks.live.test.ts
 * Results are appended to fieldlens-live-picks/report.txt in the OS temp folder.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../shared/categories';
import type { IdentifyTarget, OrganismCategory } from '../../shared/types';
import { BioclipIdentificationProvider } from '../../server/providers/bioclip/bioclipProvider';

for (const line of existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const SPACE = process.env.BIOCLIP_SPACE_URL;
const TOKEN = process.env.HF_TOKEN;

/** [species, pick a person would choose, category the result should land in] */
const CASES: [string, IdentifyTarget, OrganismCategory][] = [
  ['Carcinus maenas', 'crustacean', 'crustacean'],
  ['Pagurus longicarpus', 'crustacean', 'crustacean'],
  ['Hemigrapsus sanguineus', 'shore', 'crustacean'],
  ['Limulus polyphemus', 'crustacean', 'crustacean'],
  ['Semibalanus balanoides', 'crustacean', 'crustacean'],
  ['Armadillidium vulgare', 'crawly', 'crustacean'],
  ['Octopus vulgaris', 'octopus', 'mollusc'],
  ['Mytilus edulis', 'clam', 'mollusc'],
  ['Littorina littorea', 'snail', 'mollusc'],
  ['Cornu aspersum', 'bug', 'mollusc'],
  ['Pisaster ochraceus', 'echinoderm', 'echinoderm'],
  ['Strongylocentrotus purpuratus', 'echinoderm', 'echinoderm'],
  ['Aurelia aurita', 'cnidarian', 'cnidarian'],
  ['Metridium senile', 'cnidarian', 'cnidarian'],
  ['Halichondria panicea', 'sponge', 'sponge'],
  ['Ascophyllum nodosum', 'seaweed', 'seaweed'],
  ['Ulva lactuca', 'shore', 'seaweed'],
  ['Polytrichum commune', 'moss', 'moss'],
  ['Xanthoria parietina', 'lichen', 'fungus'],
  ['Lumbricus terrestris', 'worm', 'worm'],
  ['Notophthalmus viridescens', 'lizard', 'amphibian'],
  // A wrong narrow pick should widen, not answer from the wrong group.
  ['Danaus plexippus', 'beetle', 'insect'],
];

const DIR = join(tmpdir(), 'fieldlens-live-picks');

async function photoOf(species: string): Promise<Uint8Array> {
  mkdirSync(DIR, { recursive: true });
  const file = join(DIR, `${species.replace(/\W+/g, '_')}.jpg`);
  if (existsSync(file)) return readFileSync(file);
  const q = new URLSearchParams({
    taxon_name: species,
    quality_grade: 'research',
    photo_license: 'cc-by,cc-by-nc,cc0',
    per_page: '1',
    order_by: 'votes',
    photos: 'true',
  });
  const res = await fetch(`https://api.inaturalist.org/v1/observations?${q}`, {
    headers: { 'User-Agent': 'FieldLens live test' },
  });
  const obs = ((await res.json()) as { results: { photos: { url: string }[] }[] }).results[0];
  const url = obs.photos[0].url.replace('square', 'medium');
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  writeFileSync(file, bytes);
  return bytes;
}

describe.skipIf(!SPACE || !TOKEN)('picker groups on the real Space', () => {
  const provider = new BioclipIdentificationProvider(
    SPACE!,
    TOKEN!,
    (Object.keys(CATEGORIES) as OrganismCategory[]).filter((c) => CATEGORIES[c].taxonScope),
  );
  const rows: string[] = [];

  it.each(CASES)('%s picked as %s', { timeout: 120_000 }, async (species, pick, expected) => {
    const data = await photoOf(species);
    const input = (category: IdentifyTarget) => ({
      observationId: 'live',
      category,
      images: [{ data, mimeType: 'image/jpeg', feature: 'auto' }],
      capturedAt: new Date(),
    });
    const auto = await provider.detectCategory(input('auto'));
    const picked = await provider.identify(input(pick));
    const top = picked.candidates[0];
    const genusRight = top?.scientificName.split(' ')[0] === species.split(' ')[0];
    const line = [
      species.padEnd(30),
      `auto=${auto.category}`.padEnd(22),
      `${pick}→${top?.category ?? picked.categoryCheck?.suggestedCategory ?? '-'}`.padEnd(26),
      `${top?.scientificName ?? '(no match)'} ${top ? Math.round(top.visualConfidence * 100) + '%' : ''}`.padEnd(
        40,
      ),
      genusRight ? 'genus ✓' : '',
    ].join(' ');
    rows.push(line);
    appendFileSync(join(DIR, 'report.txt'), `${line}\n`);
    expect(top?.category).toBe(expected);
  });

  it('report', () => {
    console.log(`\n${rows.join('\n')}\n`);
  });
});
