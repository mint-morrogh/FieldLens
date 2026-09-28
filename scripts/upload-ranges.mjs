// Uploads the species range index built by scripts/build-range-shards.py to a private
// Hugging Face dataset, which the server reads with its read-only HF_TOKEN.
// Usage: node scripts/upload-ranges.mjs <dist dir>
//   (reads HF_DEPLOY_TOKEN and optional RANGES_DATASET from .env.local or the environment)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRepo, repoExists, uploadFiles } from '@huggingface/hub';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvFile('.env.local');

const dist = process.argv[2];
const token = process.env.HF_DEPLOY_TOKEN;
const name = process.env.RANGES_DATASET || 'mintmundane/fieldlens-ranges';
if (!dist || !existsSync(join(dist, 'meta.json'))) {
  console.error('Usage: node scripts/upload-ranges.mjs <dist dir containing meta.json>');
  process.exit(1);
}
if (!token) {
  console.error('Set HF_DEPLOY_TOKEN (a Hugging Face WRITE token) in .env.local first.');
  process.exit(1);
}
const repo = { type: 'dataset', name };
if (!(await repoExists({ repo, accessToken: token }))) {
  await createRepo({ repo, accessToken: token, private: true });
  console.log(`Created private dataset ${name}.`);
}

const meta = JSON.parse(readFileSync(join(dist, 'meta.json'), 'utf8'));
const file = (path) => ({ path, content: new Blob([readFileSync(join(dist, path))]) });
const files = [
  ...readdirSync(join(dist, 'shards')).map((f) => `shards/${f}`),
  ...readdirSync(join(dist, 'taxa')).map((f) => `taxa/${f}`),
];

const README = `---
license: cc-by-4.0
---
# FieldLens species ranges

Where species are expected to occur, repackaged for the FieldLens app from the
[iNaturalist Open Range Map Dataset](https://www.inaturalist.org/pages/range_maps) (CC BY 4.0),
version ${meta.version}.

${meta.citation}

- \`shards/{h3 resolution-2 cell}.bin\`: for each resolution-4 child cell, the sorted iNaturalist taxon ids
  expected there: \`[u64 LE cell][u32 LE count][count LEB128 varints, delta-encoded]\`.
- \`taxa/{first two letters}.json\`: lower-case scientific name → iNaturalist taxon id.
- \`meta.json\`: version, counts and sizes.

Built by \`scripts/build-range-shards.py\` in the FieldLens repository.
`;

// Commit in batches: one huge commit is slow and fragile.
const BATCH = 800;
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH).map(file);
  if (i === 0) batch.push(file('meta.json'), { path: 'README.md', content: new Blob([README]) });
  await uploadFiles({
    repo,
    accessToken: token,
    files: batch,
    commitTitle: `Range index ${meta.version} (${i + 1}–${Math.min(i + BATCH, files.length)} of ${files.length})`,
  });
  console.log(`Uploaded ${Math.min(i + BATCH, files.length)} / ${files.length}`);
}
console.log(`Done: ${name} now holds range index ${meta.version}.`);
