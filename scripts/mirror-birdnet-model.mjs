// Optional: copies the on-device BirdNET v2.4 model into a public Hugging Face model repo, in
// case the default source (the BirdNET team's files on jsDelivr, pinned by commit) ever goes
// away. Not needed otherwise. See docs/research/birdnet-browser.md.
//
// Usage: node scripts/mirror-birdnet-model.mjs
//   Reads HF_DEPLOY_TOKEN (a WRITE token) and optionally HF_BIRDNET_REPO from .env.local.
//   Prints the VITE_BIRDNET_MODEL_URL to set in Vercel afterwards (then redeploy).
//
// Licence: the weights are CC BY-NC-SA 4.0 (non-commercial). The repo gets the licence notice
// and a README next to the files, as the licence requires when sharing them.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRepo, uploadFiles } from '@huggingface/hub';
import {
  BIRDNET_FILES,
  BIRDNET_LICENSE,
  BIRDNET_SOURCE_URL,
  LICENSE_TEXT,
} from '../src/features/listen/birdnet/manifest.ts';

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

const files = [];
for (const file of BIRDNET_FILES) {
  const res = await fetch(BIRDNET_SOURCE_URL + file.path);
  if (!res.ok) throw new Error(`${file.path}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== file.sha256) throw new Error(`${file.path}: checksum mismatch`);
  files.push({ path: file.path, content: new Blob([bytes]) });
  console.log(`fetched ${file.path}`);
}

const readme = `---
license: cc-by-nc-sa-4.0
tags: [audio-classification, birds, birdnet, tfjs]
---
# BirdNET v2.4 (TF.js), mirrored for FieldLens

${BIRDNET_LICENSE.credit}.

Unmodified copy of the TF.js files published by the BirdNET team in BirdNET Live
(github.com/birdnet-team/real-time-pwa, commit 6ab67ac): acoustic model, location model and
English labels. Original model record: ${BIRDNET_LICENSE.modelRecordUrl}

Licensed under ${BIRDNET_LICENSE.name} (${BIRDNET_LICENSE.url}). Non-commercial use only.
See LICENSE.txt.
`;
files.push({ path: 'LICENSE.txt', content: new Blob([LICENSE_TEXT]) });
files.push({ path: 'README.md', content: new Blob([readme]) });

await createRepo({
  repo: { type: 'model', name: repo },
  accessToken: token,
  visibility: 'public',
  license: 'cc-by-nc-sa-4.0',
}).catch((e) => {
  if (!/already exists|409/i.test(String(e?.message ?? e))) throw e;
});
const out = await uploadFiles({
  repo: { type: 'model', name: repo },
  accessToken: token,
  files,
  commitTitle: 'Mirror BirdNET v2.4 TF.js files',
});
const rev = out?.commit?.oid ?? 'main';
console.log(`\nUploaded to https://huggingface.co/${repo}`);
console.log(`Set in Vercel: VITE_BIRDNET_MODEL_URL=https://huggingface.co/${repo}/resolve/${rev}/`);
