// Publishes BirdNET v2.4's official location ("metadata") model, TF.js build, to a public
// Hugging Face model repo so the app can download it for on-device Bird calls. The file is
// only published inside the Zenodo zip, which browsers can't fetch piecemeal. BirdNET Live's
// `area-model` (what jsDelivr serves) is an older location model than the one the Space uses;
// see docs/research/birdnet-browser.md §8.
//
// Usage: node scripts/upload-birdnet-location-model.mjs [path/to/BirdNET_v2.4_tfjs.zip]
//   Reads HF_DEPLOY_TOKEN (a WRITE token) and optionally HF_BIRDNET_REPO from .env.local.
//   Downloads the zip from Zenodo when no path is given. Prints the pinned base URL and the
//   file list (bytes + SHA-256) for src/features/listen/birdnet/manifest.ts.
//
// Licence: CC BY-NC-SA 4.0 (non-commercial). The repo gets the licence notice and a README.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepo, uploadFiles } from '@huggingface/hub';

const ZIP_URL = 'https://zenodo.org/records/15050749/files/BirdNET_v2.4_tfjs.zip?download=1';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvFile('.env.local');

const token = process.env.HF_DEPLOY_TOKEN;
const repo = process.env.HF_BIRDNET_REPO || 'mintmundane/fieldlens-birdnet-v2.4';
if (!token) {
  console.error('Set HF_DEPLOY_TOKEN (a Hugging Face WRITE token) in .env.local first.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'birdnet-mdata-'));
let zip = process.argv[2];
if (!zip) {
  zip = join(work, 'tfjs.zip');
  console.log('downloading', ZIP_URL);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Zenodo: HTTP ${res.status}`);
  writeFileSync(zip, new Uint8Array(await res.arrayBuffer()));
}
execFileSync('unzip', ['-oq', zip, 'model/mdata/*', '-d', work]);
const dir = join(work, 'model', 'mdata');

const files = [];
const manifest = [];
for (const name of readdirSync(dir).sort()) {
  const bytes = readFileSync(join(dir, name));
  const sha = createHash('sha256').update(bytes).digest('hex');
  files.push({ path: `mdata/${name}`, content: new Blob([bytes]) });
  manifest.push([`mdata/${name}`, bytes.length, sha]);
}

const credit =
  'BirdNET v2.4 by the K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology and Chemnitz University of Technology';
const license = `BirdNET v2.4 location (metadata) model, TF.js

${credit}.
Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021). BirdNET: A deep learning solution for
avian diversity monitoring. Ecological Informatics, 61, 101236.

Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0), https://creativecommons.org/licenses/by-nc-sa/4.0/
The Zenodo record (https://zenodo.org/records/15050749) lists CC BY-NC 4.0; the stricter
BY-NC-SA terms are followed here. Non-commercial use only.

Source: model/mdata/ in BirdNET_v2.4_tfjs.zip from https://zenodo.org/records/15050749
Changes: none. The files are copied unmodified.
`;
const readme = `---
license: cc-by-nc-sa-4.0
tags: [birds, birdnet, tfjs]
---
# BirdNET v2.4 location model (TF.js), mirrored for FieldLens

${credit}.

Unmodified copy of \`model/mdata/\` from the official BirdNET v2.4 TF.js release
(https://zenodo.org/records/15050749): input \`[latitude, longitude, week]\` (48-week year,
-1 for all year), output one occurrence score per label of the v2.4 acoustic model.

Licensed under CC BY-NC-SA 4.0. Non-commercial use only. See LICENSE.txt.
`;
files.push({ path: 'LICENSE.txt', content: new Blob([license]) });
files.push({ path: 'README.md', content: new Blob([readme]) });

await createRepo({
  repo: { type: 'model', name: repo },
  accessToken: token,
  visibility: 'public',
  license: 'cc-by-nc-sa-4.0',
}).catch((e) => {
  if (!/already exists|409|conflict/i.test(String(e?.message ?? e))) throw e;
});
const out = await uploadFiles({
  repo: { type: 'model', name: repo },
  accessToken: token,
  files,
  commitTitle: 'BirdNET v2.4 location model (TF.js, from Zenodo)',
});
const rev = out?.commit?.oid ?? 'main';
console.log(`\nbase URL: https://huggingface.co/${repo}/resolve/${rev}/`);
console.log(JSON.stringify(manifest, null, 1));
